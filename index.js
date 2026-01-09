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
const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===============================
   CONTEXT MEMORY (SMART)
================================ */
const contextMap = new Map();
const CONTEXT_TTL = 2 * 60 * 1000;

function setContext(userId, ctx) {
  contextMap.set(userId, { ...ctx, updatedAt: Date.now() });
}

function getContext(userId) {
  const ctx = contextMap.get(userId);
  if (!ctx) return null;
  if (Date.now() - ctx.updatedAt > CONTEXT_TTL) {
    contextMap.delete(userId);
    return null;
  }
  return ctx;
}

function clearContext(userId) {
  contextMap.delete(userId);
}

/* ===============================
   INTENT DETECTOR
================================ */
function detectIntent(text) {
  if (/ราคา|เปิด|ปิด|เท่าไหร่/i.test(text)) return 'price';
  if (/แนวรับ|แนวต้าน|ema|เทคนิค/i.test(text)) return 'technical';
  if (/ข่าว|เกิดอะไร|กระทบ/i.test(text)) return 'news';
  if (/น่าลงทุน|มุมมอง|แนวโน้ม|ดีไหม/i.test(text)) return 'analysis';
  return 'unknown';
}

/* ===============================
   ASSET DETECTOR
================================ */
function detectAsset(text) {
  const t = text.toUpperCase();

  if (/ทอง|GOLD|XAU/.test(t)) {
    return { type: 'gold', symbol: 'XAUUSD' };
  }

  if (/BTC|ETH|SOL|DOGE/.test(t)) {
    return { type: 'crypto', symbol: t.match(/BTC|ETH|SOL|DOGE/)[0] };
  }

  if (/^[A-Z]{1,6}$/.test(t)) {
    return { type: 'stock', symbol: t };
  }

  return null;
}

/* ===============================
   DATA FETCHERS
================================ */
async function getStockQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const { data } = await axios.get(url);
  if (!data || data.c === 0) return null;
  return {
    symbol,
    current: data.c,
    open: data.o,
    prevClose: data.pc,
    assetType: 'stock'
  };
}

async function getCryptoQuote(symbol) {
  const map = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    DOGE: 'dogecoin'
  };
  const id = map[symbol];
  if (!id) return null;

  const { data } = await axios.get(
    'https://api.coingecko.com/api/v3/simple/price',
    {
      params: {
        ids: id,
        vs_currencies: 'usd',
        include_24hr_change: true
      }
    }
  );

  return {
    symbol,
    current: data[id].usd,
    changePercent: data[id].usd_24h_change,
    assetType: 'crypto'
  };
}

/* ===============================
   OPENAI (CONTEXT-AWARE)
================================ */
async function askAI(context, question) {
  const messages = [
    {
      role: 'system',
      content: `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
ตอบแบบให้ข้อมูล วิเคราะห์จริง ไม่ชี้นำลงทุน
ถ้าไม่มั่นใจให้ถามกลับผู้ใช้
`
    }
  ];

  if (context) {
    messages.push({
      role: 'assistant',
      content: `บริบทก่อนหน้า: ${JSON.stringify(context)}`
    });
  }

  messages.push({ role: 'user', content: question });

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4.1-mini',
      messages,
      temperature: 0.6
    },
    {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
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

    let ctx = getContext(userId);
    const intent = detectIntent(text);
    const asset = detectAsset(text);

    /* ===== ASSET FOUND ===== */
    if (asset) {
      let data = null;

      if (asset.type === 'stock') data = await getStockQuote(asset.symbol);
      if (asset.type === 'crypto') data = await getCryptoQuote(asset.symbol);

      if (!data) {
        await replyLine(event.replyToken, [
          { type: 'text', text: 'ผมยังไม่สามารถดึงข้อมูลสินทรัพย์นี้ได้ครับ' }
        ]);
        return res.sendStatus(200);
      }

      setContext(userId, {
        assetType: asset.type,
        symbol: asset.symbol,
        intent
      });

      const flex = buildStockFlex(data);
      await replyLine(event.replyToken, [flex]);
      return res.sendStatus(200);
    }

    /* ===== CONTINUATION ===== */
    if (ctx) {
      const ai = await askAI(ctx, text);
      await replyLine(event.replyToken, [{ type: 'text', text: ai }]);
      return res.sendStatus(200);
    }

    /* ===== NOT SURE → ASK ===== */
    await replyLine(event.replyToken, [
      {
        type: 'text',
        text: 'เธอหมายถึงสินทรัพย์อะไร (หุ้น / คริปโต / ทอง) และต้องการข้อมูลด้านไหนครับ?'
      }
    ]);

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/* ===============================
   START
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Smart Signal Zeeker Bot running on ${PORT}`);
});
