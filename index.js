require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* ===============================
   FINNHUB
================================ */
async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   FLEX BUILDER
================================ */
function buildPriceFlex(symbol, q) {
  const change = q.d || 0;
  const pct = q.dp || 0;
  const up = change > 0;

  return {
    type: 'flex',
    altText: `${symbol} $${q.c}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: symbol, size: 'xl', weight: 'bold' },
          {
            type: 'text',
            text: `$${q.c}`,
            size: 'xxl',
            weight: 'bold',
            color: up ? '#16A34A' : '#DC2626'
          },
          {
            type: 'text',
            text: `${up ? '▲' : '▼'} ${change.toFixed(2)} (${pct.toFixed(2)}%)`,
            size: 'md',
            color: up ? '#16A34A' : '#DC2626'
          },
          { type: 'separator' },
          {
            type: 'text',
            text: `H ${q.h}  L ${q.l}  O ${q.o}`,
            size: 'sm',
            color: '#6B7280'
          }
        ]
      }
    }
  };
}

/* ===============================
   AI
================================ */
async function askAI(text) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'คุณคือ AI วิเคราะห์ตลาด พูดเหมือนคนจริง ไม่เดาราคา ถ้าถามควรซื้อไหมให้ตอบเชิงความน่าจะเป็น ลงท้ายด้วยครับ'
        },
        { role: 'user', content: text }
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
}

/* ===============================
   LINE REPLY
================================ */
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

/* ===============================
   WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') {
      return res.sendStatus(200);
    }

    if (event.message.type !== 'text') {
      await reply(event.replyToken, [
        { type: 'text', text: 'พิมพ์ชื่อหุ้น US เช่น AAPL, NVDA, TSLA ได้เลยครับ' }
      ]);
      return res.sendStatus(200);
    }

    const raw = event.message.text;
    const text = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();

    console.log('USER INPUT:', raw, '→', text);

    /* === PRICE MODE === */
    if (text.length >= 2 && text.length <= 6) {
      const q = await getQuote(text);
      console.log('FINNHUB:', q);

      if (q && typeof q.c === 'number' && q.c > 0) {
        const flex = buildPriceFlex(text, q);
        await reply(event.replyToken, [flex]);
        return res.sendStatus(200);
      }
    }

    /* === AI MODE === */
    const aiText = await askAI(raw);
    await reply(event.replyToken, [{ type: 'text', text: aiText }]);

    res.sendStatus(200);
  } catch (err) {
    console.error('ERROR:', err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
