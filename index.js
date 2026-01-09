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

function setContext(userId, ctx) {
  contextMap.set(userId, { ...ctx, updatedAt: Date.now() });
}

function getContext(userId) {
  const ctx = contextMap.get(userId);
  if (!ctx) return null;
  if (Date.now() - ctx.updatedAt > 60 * 1000) {
    contextMap.delete(userId);
    return null;
  }
  return ctx;
}

function clearContext(userId) {
  contextMap.delete(userId);
}

/* ===============================
   SIMPLE CACHE (price protection)
================================ */
const priceCache = new Map();
const CACHE_TTL = 60 * 1000;

function getCache(key) {
  const c = priceCache.get(key);
  if (!c) return null;
  if (Date.now() - c.updatedAt > CACHE_TTL) {
    priceCache.delete(key);
    return null;
  }
  return c.data;
}

function setCache(key, data) {
  priceCache.set(key, { data, updatedAt: Date.now() });
}

/* ===============================
   SYSTEM PROMPT (UNCHANGED)
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
   HELPERS
================================ */
function splitForLine(text, maxLen = 900) {
  const out = [];
  const parts = text.split(/\n{2,}/).map(t => t.trim()).filter(Boolean);
  for (const p of parts) {
    if (out.length >= 5) break;
    out.push({ type: 'text', text: p.slice(0, maxLen) });
  }
  return out;
}

function detectAsset(text) {
  const t = text.toUpperCase().trim();

  if (/^(BTC|ETH|BNB|SOL|XRP|ADA|DOGE)$/.test(t)) {
    return { type: 'CRYPTO', symbol: `${t}USDT` };
  }

  if (/^[A-Z]{1,6}$/.test(t)) {
    return { type: 'STOCK', symbol: t };
  }

  if (/(ทอง|GOLD|XAU)/i.test(t)) {
    return { type: 'GOLD', symbol: 'XAUUSD' };
  }

  return { type: 'UNKNOWN' };
}

/* ===============================
   FINNHUB (STOCK)
================================ */
async function getStockQuote(symbol) {
  const cacheKey = `STOCK_${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  const q = res.data;
  if (!q || q.c === 0) return null;

  const data = {
    symbol,
    current: q.c,
    open: q.o,
    prevClose: q.pc,
    marketStatus: q.c !== q.pc ? 'OPEN' : 'CLOSED'
  };

  setCache(cacheKey, data);
  return data;
}

/* ===============================
   BINANCE (CRYPTO – SAFE MODE)
================================ */
async function getCryptoQuote(symbol) {
  const cacheKey = `CRYPTO_${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  });

  const q = res.data;
  const data = {
    symbol,
    current: parseFloat(q.lastPrice),
    open: parseFloat(q.openPrice),
    prevClose: parseFloat(q.prevClosePrice),
    changePercent: parseFloat(q.priceChangePercent),
    marketStatus: '24H'
  };

  setCache(cacheKey, data);
  return data;
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
    const text = event.message.text.trim();
    const intent = detectAsset(text);

    clearContext(userId);

    /* ===== PRICE REQUEST ===== */
    if (intent.type === 'STOCK') {
      const q = await getStockQuote(intent.symbol);
      if (!q) {
        await replyLine(event.replyToken, [{ type: 'text', text: 'ไม่พบข้อมูลหุ้นครับ' }]);
        return res.sendStatus(200);
      }
      setContext(userId, { asset: 'STOCK', symbol: intent.symbol });
      return replyLine(event.replyToken, [buildStockFlex(q)]);
    }

    if (intent.type === 'CRYPTO') {
      const q = await getCryptoQuote(intent.symbol);
      setContext(userId, { asset: 'CRYPTO', symbol: intent.symbol });
      return replyLine(event.replyToken, [buildStockFlex(q)]);
    }

    /* ===== ANALYSIS / CHAT ===== */
    const ctx = getContext(userId);
    const prompt = ctx
      ? `บริบท ${ctx.asset} ${ctx.symbol}: ${text}`
      : text;

    const ai = await askOpenAI(prompt);
    return replyLine(event.replyToken, splitForLine(ai));

  } catch (err) {
    console.error('SERVER ERROR:', err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   START
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI running on ${PORT}`);
});
