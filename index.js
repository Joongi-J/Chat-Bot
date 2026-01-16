require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { buildPriceFlex } = require('./flexBuilder');
const { askAI } = require('./ai');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===== Finnhub ===== */
async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===== LINE Reply ===== */
async function reply(replyToken, messages) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken, messages },
    { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
  );
}

/* ===== Webhook ===== */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') {
      return res.sendStatus(200);
    }

    const text = event.message.text.trim();
    const upper = text.toUpperCase();

    /* === 1. ถ้าเป็น SYMBOL === */
    if (/^[A-Z]{2,6}$/.test(upper)) {
      const q = await getQuote(upper);

      if (q && q.c && q.c !== 0) {
        const flex = buildPriceFlex(upper, q);
        await reply(event.replyToken, [flex]);
        return res.sendStatus(200);
      }

      await reply(event.replyToken, [
        { type: 'text', text: `ไม่พบราคาปัจจุบันของ ${upper} ครับ` }
      ]);
      return res.sendStatus(200);
    }

    /* === 2. อื่น ๆ ใช้ AI === */
    const aiText = await askAI(text);
    await reply(event.replyToken, [{ type: 'text', text: aiText }]);

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook ERROR:', e.message);
    res.sendStatus(500);
  }
});

/* ===== Server ===== */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker Bot running on port ${PORT}`);
});
