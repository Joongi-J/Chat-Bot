require('dotenv').config();
const express = require('express');
const axios = require('axios');

const { getQuote, getTopGainersUS } = require('./finnhub');
const { askAI } = require('./ai');
const { setContext, getContext } = require('./contextStore');
const { buildPriceFlex } = require('./flexBuilder');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;

/* ===============================
   LINE REPLY
================================ */
async function reply(replyToken, messages) {
  return axios.post(
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
  const event = req.body.events?.[0];
  if (!event || event.type !== 'message') return res.sendStatus(200);

  const userId = event.source.userId;
  const replyToken = event.replyToken;

  const rawText = event.message.text || '';
  const text = rawText.trim().toUpperCase();
  const context = getContext(userId);

  /* ===== SYMBOL DETECTION ===== */
  const isSymbol = /^[A-Z]{2,10}$/.test(text);

  const CRYPTO_LIST = ['BTC', 'ETH', 'SOL', 'BNB', 'AVAX'];
  const isCrypto = CRYPTO_LIST.includes(text);

  /* ===== US STOCK PRICE ===== */
  if (isSymbol && !isCrypto) {
    const quote = await getQuote(text);

    if (quote && quote.c) {
      setContext(userId, `ดูราคาหุ้น ${text}`);
      await reply(replyToken, [buildPriceFlex(text, quote)]);
      return res.sendStatus(200);
    }

    // fallback → AI
    const ai = await askAI(
      `ผู้ใช้ถามเกี่ยวกับหุ้น ${text} แต่ไม่สามารถดึงราคา realtime ได้ อธิบายภาพรวมแทน`,
      context
    );
    await reply(replyToken, [{ type: 'text', text: ai }]);
    return res.sendStatus(200);
  }

  /* ===== CRYPTO MODE ===== */
  if (isCrypto) {
    const ai = await askAI(
      `ผู้ใช้ถามเกี่ยวกับคริปโต ${text} อธิบายสถานะตลาด แนวโน้ม และสิ่งที่นักลงทุนกำลังจับตา (ไม่ต้องให้ราคา)`,
      context
    );
    setContext(userId, `ถามคริปโต ${text}`);
    await reply(replyToken, [{ type: 'text', text: ai }]);
    return res.sendStatus(200);
  }

  /* ===== TOP GAINER ===== */
  if (text.includes('บวกแรง') || text.includes('TOP GAINER')) {
    const list = await getTopGainersUS();
    await reply(replyToken, [{ type: 'text', text: list }]);
    return res.sendStatus(200);
  }

  /* ===== GENERAL AI CHAT ===== */
  const ai = await askAI(rawText, context);
  setContext(userId, rawText);
  await reply(replyToken, [{ type: 'text', text: ai }]);

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🤖 Signal Zeeker running on ${PORT}`);
});
