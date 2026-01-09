require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { buildStockFlex } = require('./flexBuilder');

const app = express();
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===============================
   CONTEXT STORE (TTL 1 นาที)
================================ */
const contextMap = new Map();

function setContext(userId, symbol) {
  contextMap.set(userId, {
    symbol,
    updatedAt: Date.now()
  });
}

function getContext(userId) {
  const ctx = contextMap.get(userId);
  if (!ctx) return null;

  if (Date.now() - ctx.updatedAt > 60 * 1000) {
    contextMap.delete(userId);
    return null;
  }
  return ctx.symbol;
}

function clearContext(userId) {
  contextMap.delete(userId);
}

/* ===============================
   SYSTEM PROMPT (Dynamic จริง)
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
คุณเป็นผู้ชาย ใช้คำว่า "ผม" และลงท้ายทุกคำตอบด้วย "ครับ"

กติกา:
- ตอบแบบวิเคราะห์จริง ไม่ใช้แพทเทิร์นเดิมซ้ำ
- ปรับโครงสร้างตามคำถาม (ไม่จำเป็นต้องครบทุกหัวข้อ)
- ถ้าเป็นคำถามต่อเนื่อง ให้เชื่อมโยงบริบทก่อนหน้า
- ถ้าเป็นคำถามใหม่ ให้ตัดบริบทเดิมทันที
- ถ้าไม่มีข้อมูลจริง ให้บอกตรง ๆ
- ห้ามชี้นำซื้อขาย
- โทนสำนักข่าว มืออาชีพ ไม่ขายฝัน
`;

/* ===============================
   LINE SAFE SPLIT (≤ 5 กล่อง)
================================ */
function splitForLine(text, maxLen = 900) {
  const messages = [];
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  for (const p of paragraphs) {
    if (messages.length >= 5) break;

    if (p.length <= maxLen) {
      messages.push({ type: 'text', text: p });
    } else {
      let start = 0;
      while (start < p.length && messages.length < 5) {
        messages.push({
          type: 'text',
          text: p.substring(start, start + maxLen)
        });
        start += maxLen;
      }
    }
  }
  return messages;
}

/* ===============================
   FINNHUB: QUOTE ONLY (FREE)
   + Market Status Detection
================================ */
async function getQuote(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    const q = res.data;

    if (!q || q.c === 0) return null;

    const lastUpdate = new Date(q.t * 1000);
    const now = new Date();

    // ถ้าอัปเดตภายในวันเดียวกัน และไม่เกิน 10 นาที → ตลาดเปิด
    const isMarketOpen =
      lastUpdate.toDateString() === now.toDateString() &&
      Math.abs(now - lastUpdate) < 10 * 60 * 1000;

    return {
      current: q.c,
      open: q.o,
      prevClose: q.pc,
      marketStatus: isMarketOpen ? 'OPEN' : 'CLOSED',
      lastUpdate
    };
  } catch (err) {
    console.error('Finnhub ERROR:', err.response?.data || err.message);
    return null;
  }
}

/* ===============================
   OPENAI
================================ */
async function askOpenAI(prompt) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (err) {
    console.error('OpenAI ERROR:', err.response?.data || err.message);
    return '📌 ตอนนี้ผมไม่สามารถประมวลผลคำตอบได้ครับ';
  }
}

/* ===============================
   LINE REPLY HELPER
================================ */
async function replyLine(replyToken, messages) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

/* ===============================
   LINE WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') {
      return res.sendStatus(200);
    }

    const userId = event.source.userId;
    let userText = event.message.text.trim();
    const isSymbolOnly = /^[A-Za-z]{1,6}$/.test(userText);

    /* ===== พิมพ์ชื่อหุ้น ===== */
    if (isSymbolOnly) {
      const symbol = userText.toUpperCase();
      clearContext(userId);

      const quote = await getQuote(symbol);

      if (!quote) {
        await replyLine(event.replyToken, [
          { type: 'text', text: `📌 ผมไม่สามารถดึงข้อมูลราคาของ ${symbol} ได้ครับ` }
        ]);
        return res.sendStatus(200);
      }

      setContext(userId, symbol);

      const flex = buildStockFlex(
        symbol,
        quote.current.toFixed(2),
        quote.open.toFixed(2),
        quote.prevClose.toFixed(2),
        quote.marketStatus,
        quote.lastUpdate
      );

      await replyLine(event.replyToken, [flex]);
      return res.sendStatus(200);
    }

    /* ===== คำถามต่อเนื่อง / คำถามใหม่ ===== */
    const lastSymbol = getContext(userId);
    if (lastSymbol) {
      userText = `บริบทหุ้น ${lastSymbol}: ${userText}`;
    }

    const aiReply = await askOpenAI(userText);
    const messages = splitForLine(aiReply);

    await replyLine(event.replyToken, messages);
    res.sendStatus(200);

  } catch (err) {
    console.error('SERVER ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot (Finnhub Quote Only) running on port ${PORT}`);
});
