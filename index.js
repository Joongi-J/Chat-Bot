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

  // หมดอายุ 1 นาที
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
   SYSTEM PROMPT (ไม่ FIX)
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
คุณเป็นผู้ชาย ใช้คำว่า "ผม" และลงท้ายทุกคำตอบด้วย "ครับ"

กติกาสำคัญ:
- ปรับความยาวและโครงสร้างตามคำถาม (ห้ามใช้แพทเทิร์นเดิมซ้ำ)
- ถ้าเป็นคำถามต่อเนื่อง ให้เชื่อมโยงบริบทก่อนหน้า
- ถ้าเป็นคำถามใหม่ ให้ตัดบริบทเดิมทันที
- ถ้าไม่มีข้อมูลจริง ให้บอกตรง ๆ
- ห้ามชี้นำซื้อขาย
- ใช้โทนวิเคราะห์แบบสำนักข่าว ไม่ขายฝัน
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
   FINNHUB: QUOTE
================================ */
async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   FINNHUB: CANDLES
================================ */
async function getCandles(symbol, resolution = 'D', days = 120) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);

  if (res.data.s !== 'ok') return null;
  return res.data;
}

/* ===============================
   INDICATORS
================================ */
function EMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

function analyzeSR(candles) {
  const highs = candles.h.slice(-20);
  const lows = candles.l.slice(-20);
  return {
    resistance: Math.max(...highs).toFixed(2),
    support: Math.min(...lows).toFixed(2)
  };
}

/* ===============================
   OPENAI
================================ */
async function askOpenAI(prompt) {
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
      const candles = await getCandles(symbol);

      if (!quote || !candles) {
        await replyLine(event.replyToken, [
          { type: 'text', text: `📌 ผมไม่สามารถดึงข้อมูลหุ้น ${symbol} ได้ในขณะนี้ครับ` }
        ]);
        return res.sendStatus(200);
      }

      const close = quote.c.toFixed(2);
      const ema50 = EMA(candles.c.slice(-60), 50);
      const ema200 = EMA(candles.c.slice(-220), 200);
      const sr = analyzeSR(candles);

      setContext(userId, symbol);

      const flex = buildStockFlex(
        symbol,
        close,
        sr.support,
        sr.resistance,
        ema50,
        ema200
      );

      await replyLine(event.replyToken, [flex]);
      return res.sendStatus(200);
    }

    /* ===== คำถามต่อเนื่อง ===== */
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
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot running on port ${PORT}`);
});
