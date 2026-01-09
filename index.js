require('dotenv').config();
const express = require('express');
const axios = require('axios');

const {
  getContext,
  setContext,
  clearContext,
  isContextExpired
} = require('./contextStore');

const { buildAssetFlex } = require('./flexBuilder');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* ===============================
   LINE Reply Helper
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
   Market Detection
================================ */
function detectMarket(text) {
  const t = text.toLowerCase();
  if (/btc|bitcoin|eth|crypto|coin|sol|bnb/.test(t)) return 'CRYPTO';
  if (/gold|ทอง|xau/.test(t)) return 'GOLD';
  return 'STOCK';
}

function extractSymbol(text, market) {
  const t = text.toLowerCase();
  if (market === 'CRYPTO') {
    if (t.includes('btc')) return 'bitcoin';
    if (t.includes('eth')) return 'ethereum';
    if (t.includes('sol')) return 'solana';
  }
  if (market === 'GOLD') return 'gold';
  const m = text.toUpperCase().match(/[A-Z]{2,5}/);
  return m ? m[0] : null;
}

/* ===============================
   AI Interpretation Layer
================================ */
function isFollowUp(text) {
  return /แล้ว|ต่อ|อีก|ยังไง|ล่ะ/.test(text);
}

function needClarification(text) {
  return /ดีไหม|ควร|เอายังไง|คิดว่า|น่าซื้อไหม/.test(text);
}

function aiInterpret(text, ctx) {
  const market = detectMarket(text);
  const symbol = extractSymbol(text, market);

  // follow-up question ใช้ context
  if (!symbol && ctx && isFollowUp(text)) {
    return { symbol: ctx.symbol, market: ctx.market, confidence: 'HIGH' };
  }

  // ไม่รู้ต้องถาม
  if (!symbol) {
    return { symbol: null, market, confidence: 'LOW' };
  }

  return { symbol, market, confidence: 'HIGH' };
}

/* ===============================
   DATA FETCHERS
================================ */
// Crypto – CoinGecko
async function fetchCrypto(coinId) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`;
  const res = await axios.get(url);
  const d = res.data[coinId];

  return {
    symbol: coinId.toUpperCase(),
    name: coinId.charAt(0).toUpperCase() + coinId.slice(1),
    price: d.usd,
    change: d.usd * (d.usd_24h_change / 100),
    percent: d.usd_24h_change,
    currency: 'USD',
    market: 'CRYPTO'
  };
}

// Gold (mock)
async function fetchGold() {
  return {
    symbol: 'XAUUSD',
    name: 'Gold Spot',
    price: 2035,
    change: 12.4,
    percent: 0.61,
    currency: 'USD',
    market: 'GOLD'
  };
}

// Stock (mock, ต่อ Finnhub ได้)
async function fetchStock(symbol) {
  return {
    symbol,
    name: `${symbol} Corp`,
    price: 248.3,
    change: -3.4,
    percent: -1.35,
    currency: 'USD',
    market: 'STOCK'
  };
}

/* ===============================
   OpenAI Strategic Analysis
================================ */
async function analyzeAI(data, userText) {
  const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
คุณวิเคราะห์หุ้น / คริปโต / ทอง
ตอบเป็นเชิงกลยุทธ์จริง พร้อม Trend / Bias
ใช้คำง่าย ๆ มืออาชีพ ไม่ขายฝัน
ลงท้ายทุกคำตอบด้วย "ครับ"
`;

  const USER_PROMPT = `
Asset: ${data.name} (${data.symbol})
Market: ${data.market}
Current Price: ${data.price} ${data.currency}
Change: ${data.change.toFixed(2)} (${data.percent.toFixed(2)}%)
User Question: ${userText}

วิเคราะห์ให้เห็น Trend, Bias, และสิ่งที่ต้องจับตามอง
ตอบสั้น กระชับ เข้าใจง่าย
`;

  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: USER_PROMPT }
        ],
        temperature: 0.7,
        max_tokens: 500
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
    return '📌 ผมไม่สามารถวิเคราะห์ตอนนี้ได้ครับ';
  }
}

/* ===============================
   WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const event = req.body.events?.[0];
  if (!event || event.type !== 'message') return;

  const userId = event.source.userId;
  const text = event.message.text;

  let ctx = getContext(userId);
  if (isContextExpired(ctx)) ctx = null;

  const ai = aiInterpret(text, ctx);

  if (!ai.symbol) {
    return replyMessage(event.replyToken, {
      type: 'text',
      text: 'ต้องการดูสินทรัพย์อะไรครับ เช่น BTC / ETH / TSLA / GOLD'
    });
  }

  setContext(userId, { symbol: ai.symbol, market: ai.market });

  try {
    let data;
    if (ai.market === 'CRYPTO') data = await fetchCrypto(ai.symbol);
    else if (ai.market === 'GOLD') data = await fetchGold();
    else data = await fetchStock(ai.symbol);

    // Flex
    const flex = buildAssetFlex(data);

    // AI Analysis
    const analysisText = await analyzeAI(data, text);

    // ส่ง 2 กล่อง: Flex + Analysis
    await replyMessage(event.replyToken, [
      flex,
      { type: 'text', text: analysisText }
    ]);
  } catch (err) {
    console.error(err);
    await replyMessage(event.replyToken, {
      type: 'text',
      text: 'เกิดข้อผิดพลาดในการดึงข้อมูลครับ'
    });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Signal Zeeker AI Bot running on ${PORT}`)
);
