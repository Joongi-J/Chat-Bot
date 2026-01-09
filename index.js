require('dotenv').config();
const express = require('express');
const axios = require('axios');

const {
  getContext,
  setContext,
  clearContext,
  isContextExpired
} = require('./contextStore');

const {
  buildStockFlex,
  buildCryptoFlex,
  buildGoldFlex
} = require('./flexBuilder');

const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PORT = process.env.PORT || 3000;

/* ===============================
   SYSTEM PROMPT
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
ใช้คำว่า "ผม" และลงท้ายด้วย "ครับ"

แนวทางการตอบ:
- ให้ข้อมูลเชิงวิเคราะห์ หุ้น คริปโต ทอง
- ไม่ชี้นำซื้อขาย
- ถ้าข้อมูลไม่พอ ให้ถามกลับ
- ถ้าเป็นคำถามต่อเนื่อง ให้เชื่อมโยงบริบทเดิม
- โทนมืออาชีพ แบบ Bloomberg / Yahoo Finance
`;

/* ===============================
   LINE Reply
================================ */
async function replyMessage(replyToken, messages) {
  return axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

/* ===============================
   OpenAI
================================ */
async function askAI(userText, context) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  if (context?.symbol) {
    messages.push({
      role: 'system',
      content: `บริบทก่อนหน้า: สินทรัพย์ ${context.symbol} (${context.intent})`
    });
  }

  messages.push({ role: 'user', content: userText });

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4.1-mini',
      messages,
      temperature: 0.6,
      max_tokens: 800
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
   Market Detection
================================ */
function detectIntent(text) {
  const t = text.toLowerCase();

  if (/btc|eth|crypto|coin|usdt|bnb|sol/.test(t)) return 'CRYPTO';
  if (/gold|ทอง|xau/.test(t)) return 'GOLD';
  if (/news|ข่าว/.test(t)) return 'NEWS';
  if (/แนวรับ|แนวต้าน|ema|เทคนิค/.test(t)) return 'TECH';

  return 'STOCK';
}

function extractSymbol(text, market) {
  const t = text.toUpperCase();

  if (market === 'CRYPTO') {
    if (t.includes('BTC')) return 'BTCUSDT';
    if (t.includes('ETH')) return 'ETHUSDT';
    if (t.includes('SOL')) return 'SOLUSDT';
  }

  if (market === 'GOLD') return 'XAUUSD';

  const match = t.match(/[A-Z]{2,5}/);
  return match ? match[0] : null;
}

/* ===============================
   Data Fetchers (เหมือนเดิม)
================================ */
async function fetchStock(symbol) {
  return {
    symbol,
    name: `${symbol} Corporation`,
    price: 248.3,
    change: -3.4,
    percent: -1.35,
    currency: 'USD',
    market: 'STOCK',
    status: 'OPEN'
  };
}

async function fetchCrypto(symbol) {
  const res = await axios.get(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
  );

  return {
    symbol,
    name: symbol.replace('USDT', ''),
    price: Number(res.data.lastPrice),
    change: Number(res.data.priceChange),
    percent: Number(res.data.priceChangePercent),
    currency: 'USDT',
    market: 'CRYPTO',
    status: '24H'
  };
}

async function fetchGold() {
  return {
    symbol: 'XAUUSD',
    name: 'Gold Spot',
    price: 2035,
    change: 12.5,
    percent: 0.62,
    currency: 'USD',
    market: 'GOLD',
    status: 'OPEN'
  };
}

/* ===============================
   Webhook
================================ */
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const event = req.body.events?.[0];
  if (!event || event.type !== 'message') return;

  const userId = event.source.userId;
  const text = event.message.text;

  let ctx = getContext(userId);
  if (isContextExpired(ctx)) ctx = null;

  const intent = detectIntent(text);
  const symbol = extractSymbol(text, intent);

  /* ===== ถ้าพิมพ์เป็น Symbol → Flex ===== */
  if (symbol) {
    setContext(userId, { symbol, intent });

    let data, flex;
    if (intent === 'CRYPTO') {
      data = await fetchCrypto(symbol);
      flex = buildCryptoFlex(data);
    } else if (intent === 'GOLD') {
      data = await fetchGold();
      flex = buildGoldFlex(data);
    } else {
      data = await fetchStock(symbol);
      flex = buildStockFlex(data);
    }

    return replyMessage(event.replyToken, flex);
  }

  /* ===== คำถามเชิงภาษา → AI ===== */
  const aiReply = await askAI(text, ctx);
  await replyMessage(event.replyToken, {
    type: 'text',
    text: aiReply
  });
});

/* ===============================
   START
================================ */
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
