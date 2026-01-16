require('dotenv').config();
const express = require('express');
const axios = require('axios');

const { getQuote, getTopMovers, searchAssets } = require('./marketService');
const { askAI } = require('./aiService');
const { getContext, setContext } = require('./contextStore');
const { buildPriceFlex } = require('./flexBuilder');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;

/* ===== LINE REPLY ===== */
async function reply(replyToken, messages) {
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

/* ===== WEBHOOK ===== */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const text = event.message.text.trim();
    const userId = event.source.userId;
    const replyToken = event.replyToken;
    const context = getContext(userId);

    /* === SYMBOL MODE (หุ้น / คริปโต) === */
    if (/^[A-Z]{2,10}$/.test(text)) {
      const quote = await getQuote(text);
      if (!quote) {
        await reply(replyToken, [{ type: 'text', text: 'ดึงข้อมูลไม่สำเร็จครับ' }]);
        return res.sendStatus(200);
      }
      setContext(userId, `ดูราคา ${text}`);
      await reply(replyToken, [buildPriceFlex(text, quote)]);
      return res.sendStatus(200);
    }

    /* === TOP MOVER === */
    if (/บวกแรง|แรงสุด|top/i.test(text)) {
      const movers = await getTopMovers();
      const ai = await askAI(
        `ลิสสินทรัพย์ที่ขยับแรงวันนี้:\n${movers.join('\n')}`,
        context
      );
      setContext(userId, 'ดู top mover');
      await reply(replyToken, [{ type: 'text', text: ai }]);
      return res.sendStatus(200);
    }

    /* === SEARCH / LIST === */
    if (/ลิส|รายชื่อ|มีอะไรบ้าง/i.test(text)) {
      const list = await searchAssets(text);
      const ai = await askAI(
        `ผู้ใช้ขอรายชื่อ:\n${list.join(', ')}`,
        context
      );
      setContext(userId, 'ขอลิส');
      await reply(replyToken, [{ type: 'text', text: ai }]);
      return res.sendStatus(200);
    }

    /* === GENERAL CHAT === */
    const ai = await askAI(text, context);
    setContext(userId, text);
    await reply(replyToken, [{ type: 'text', text: ai }]);
    res.sendStatus(200);

  } catch (err) {
    console.error(err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log('🤖 Signal Zeeker running');
});
