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
  contextMap.set(userId, { symbol, updatedAt: Date.now() });
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
   SYSTEM PROMPT
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
คุณเป็นผู้ชาย ใช้คำว่า "ผม" และลงท้ายทุกคำตอบด้วย "ครับ"
- วิเคราะห์แบบสำนักข่าว
- ไม่ชี้นำซื้อขาย
`;

/* ===============================
   FINNHUB : STOCK
================================ */
async function getQuote(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    const q = res.data;

    if (!q || q.c === 0) return null;

    const lastUpdate = new Date(q.t * 1000);
    const now = new Date();

    const isMarketOpen =
      lastUpdate.toDateString() === now.toDateString() &&
      Math.abs(now - lastUpdate) < 10 * 60 * 1000;

    return {
      symbol,
      market: 'stock',
      current: q.c,
      open: q.o,
      prevClose: q.pc,
      marketStatus: isMarketOpen ? 'OPEN' : 'CLOSED',
      lastUpdate
    };
  } catch (err) {
    console.error('Finnhub ERROR:', err.message);
    return null;
  }
}

/* ===============================
   BINANCE : CRYPTO (เพิ่ม)
================================ */
async function getCryptoQuote(pair) {
  try {
    const res = await axios.get(
      'https://api.binance.com/api/v3/ticker/24hr',
      { params: { symbol: pair } }
    );
    const q = res.data;

    return {
      symbol: pair,
      market: 'crypto',
      current: Number(q.lastPrice),
      open: Number(q.openPrice),
      prevClose: Number(q.prevClosePrice),
      marketStatus: '24H',
      lastUpdate: new Date(q.closeTime)
    };
  } catch (err) {
    console.error('Binance ERROR:', err.message);
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
  } catch {
    return '📌 ตอนนี้ผมไม่สามารถประมวลผลคำตอบได้ครับ';
  }
}

/* ===============================
   LINE REPLY
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
   WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text.trim().toUpperCase();

    clearContext(userId);
    let data = null;

    /* ===== CRYPTO ===== */
    if (/^[A-Z]{3,10}USDT$/.test(text)) {
      data = await getCryptoQuote(text);
    }

    /* ===== STOCK ===== */
    else if (/^[A-Z]{1,6}$/.test(text)) {
      data = await getQuote(text);
    }

    else {
      await replyLine(event.replyToken, [
        { type: 'text', text: '📌 รูปแบบไม่ถูกต้อง (หุ้น: AAPL | คริปโต: BTCUSDT)' }
      ]);
      return res.sendStatus(200);
    }

    if (!data) {
      await replyLine(event.replyToken, [
        { type: 'text', text: '📌 ไม่สามารถดึงข้อมูลราคาได้ในขณะนี้ครับ' }
      ]);
      return res.sendStatus(200);
    }

    setContext(userId, data.symbol);

    const flex = buildStockFlex(data);
    await replyLine(event.replyToken, [flex]);

    res.sendStatus(200);

  } catch (err) {
    console.error('SERVER ERROR:', err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot running on port ${PORT}`);
});
