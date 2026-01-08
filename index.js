require('dotenv').config();
const express = require('express');
const axios = require('axios');

const { buildStockFlex } = require('./flexBuilder');
const {
  getContext,
  setContext,
  clearContext,
  isContextExpired
} = require('./contextStore');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===============================
   OpenAI (ไม่ Fix, ผู้ชาย, ผม/ครับ)
================================ */
async function askAI(prompt, symbol) {
  const systemPrompt = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
บุคลิก: ผู้ชาย สุขุม ฉลาด พูดแบบนักวิเคราะห์มืออาชีพ
สรรพนาม: ใช้ "ผม" และลงท้ายด้วย "ครับ"
ห้ามตอบซ้ำ шабเดิม
ต้องอิงบริบทคำถามปัจจุบัน
ถ้าเป็นคำถามต่อ ให้ต่อเนื่องจากบริบทเดิม
`;

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      temperature: 0.8,
      max_tokens: 900,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: symbol
            ? `หุ้น ${symbol}: ${prompt}`
            : prompt
        }
      ]
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
   Finnhub
================================ */
async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

async function getCandles(symbol) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 220;

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   LINE Webhook
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const userId = event.source.userId;
    const text = event.message.text.trim();

    const ctx = getContext(userId);
    const symbolMatch = text.match(/^[A-Za-z]{1,6}$/);
    let symbol = null;

    // ตัดสินใจว่าเป็นคำถามใหม่หรือถามต่อ
    if (symbolMatch) {
      symbol = symbolMatch[0].toUpperCase();
      setContext(userId, { symbol });
    } else if (ctx && !isContextExpired(ctx)) {
      symbol = ctx.symbol;
    } else {
      clearContext(userId);
    }

    const messages = [];

    // ถ้ามี symbol → ส่ง Flex ก่อน
    if (symbolMatch) {
      const quote = await getQuote(symbol);
      const candles = await getCandles(symbol);

      messages.push(buildStockFlex(symbol, quote, candles));
    }

    // AI analysis
    const aiText = await askAI(text, symbol);
    messages.push({ type: 'text', text: aiText });

    // ❗ LINE จำกัด 5 messages
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: messages.slice(0, 5)
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Signal Zeeker Bot running on ${PORT}`)
);
