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
   FINNHUB STOCK
================================ */
async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   FINNHUB CRYPTO
================================ */
async function getCryptoQuote(symbol) {
  const url = `https://finnhub.io/api/v1/crypto/quote?symbol=BINANCE:${symbol}&token=${FINNHUB_API_KEY}`;
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
   SYSTEM PROMPT
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดสไตล์เพจ Signal Zeeker

- ต้องใช้ข้อมูลล่าสุดจากการค้นหาเว็บก่อนตอบ
- วิเคราะห์แบบมืออาชีพ
- กระชับ ชัด เห็นเกมเงินไหล
- ไม่สอนพื้นฐาน
- ไม่เยิ่นเย้อ
- ลงท้ายด้วยครับ
`;

/* ===============================
   OPENAI (WEB SEARCH ENABLED)
================================ */
async function askAI(userText) {
  const res = await axios.post(
    'https://api.openai.com/v1/responses',
    {
      model: 'gpt-4.1-mini',
      tools: [{ type: "web_search" }],
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: userText
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

  return res.data.output_text;
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
        { type: 'text', text: 'พิมพ์ชื่อหุ้นหรือคริปโต เช่น AAPL, NVDA, BTCUSDT ได้เลยครับ' }
      ]);
      return res.sendStatus(200);
    }

    const raw = event.message.text.trim();
    let text = raw.toUpperCase();

    console.log('USER:', raw);

    /* ===============================
       CRYPTO MODE (BTCUSDT)
    =================================*/
    if (/^[A-Z]{3,10}USDT$/.test(text)) {
      try {
        const q = await getCryptoQuote(text);
        if (q?.c > 0) {
          const flex = buildPriceFlex(text, q);
          await reply(event.replyToken, [flex]);
          return res.sendStatus(200);
        }
      } catch (e) {
        console.log('Crypto error → fallback AI');
      }
    }

    /* ===============================
       STOCK MODE (AAPL, TSLA)
    =================================*/
    if (/^[A-Z]{1,6}$/.test(text)) {
      try {
        const q = await getQuote(text);
        if (q?.c > 0) {
          const flex = buildPriceFlex(text, q);
          await reply(event.replyToken, [flex]);
          return res.sendStatus(200);
        }
      } catch (e) {
        console.log('Stock error → fallback AI');
      }
    }

    /* ===============================
       AI MODE (ค้นเว็บก่อนตอบ)
    =================================*/
    const aiText = await askAI(raw);

    await reply(event.replyToken, [
      { type: 'text', text: aiText }
    ]);

    res.sendStatus(200);

  } catch (err) {
    console.error('ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker running on port ${PORT}`);
});
