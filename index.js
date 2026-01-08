require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ===============================
   CONFIG
================================ */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===============================
   SYSTEM PROMPT
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
คุณเป็นผู้ชาย ใช้คำว่า "ผม" และลงท้ายทุกข้อความด้วย "ครับ"
ตอบแบบ dynamic ไม่ fix เน้นให้เหมือนคนฉลาดจริง ๆ
ถ้าไม่มีข้อมูลจริงให้บอกตรง ๆ
โครงสร้างคำตอบ:
📌 
`;

/* ===============================
   HELPER: แยกข้อความ LINE-safe
================================ */
function splitForLine(text, maxLen = 900) {
  const messages = [];
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  for (const p of paragraphs) {
    if (messages.length >= 5) break; // LINE API limit 5 messages
    if (p.length <= maxLen) {
      messages.push({ type: 'text', text: p });
    } else {
      let start = 0;
      while (start < p.length && messages.length < 5) {
        messages.push({ type: 'text', text: p.substring(start, start + maxLen) });
        start += maxLen;
      }
    }
  }

  return messages;
}

/* ===============================
   Finnhub: ราคาหุ้น
================================ */
async function getStockPrice(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch (err) {
    console.error('Finnhub ERROR:', err.response?.data || err.message);
    return null;
  }
}

/* ===============================
   OpenAI: dynamic response
================================ */
async function askOpenAI(prompt) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1200,
        temperature: 0.7
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
    return '📌 ผมไม่สามารถประมวลผลคำตอบได้ในขณะนี้ครับ';
  }
}

/* ===============================
   LINE WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const userText = event.message.text.trim();
    const symbolOnly = /^[A-Za-z]{1,6}$/.test(userText);

    let replyText = '';

    if (symbolOnly) {
      const symbol = userText.toUpperCase();
      const price = await getStockPrice(symbol);

      if (price) {
        const prompt = `
วิเคราะห์หุ้น ${symbol} แบบละเอียดเหมือนบทวิเคราะห์จริง ๆ
ใช้ราคาต่อไปนี้เป็นข้อมูล: 
ราคาปิดล่าสุด: ${price.c}, สูงสุดวันนี้: ${price.h}, ต่ำสุดวันนี้: ${price.l}, ราคาปิดก่อนหน้า: ${price.pc}
ตอบครบทุกหัวข้อ: 📊 ภาพรวม, 🧠 ปัจจัยสำคัญ, ⚠️ ความเสี่ยง, 📈 มุมมองตลาด, 📌 สรุป
ใช้คำว่า "ผม" และลงท้าย "ครับ"
`;

        replyText = await askOpenAI(prompt);
      } else {
        replyText = `📌 ผมไม่สามารถดึงข้อมูลหุ้น ${symbol} ได้ครับ โปรดตรวจสอบ symbol หรือ API Key ของ Finnhub ครับ`;
      }
    } else {
      // คำถามทั่วไป → dynamic
      replyText = await askOpenAI(userText);
    }

    const messages = splitForLine(replyText);

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      { replyToken: event.replyToken, messages },
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('SERVER ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot (dynamic, ผู้ชาย) running on port ${PORT}`);
});
