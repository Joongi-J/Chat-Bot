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
   SYSTEM PROMPT (กันข้อความขาด)
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI ผู้ช่วยของเพจ Signal Zeeker

กติกาสำคัญ:
- ตอบเป็นหัวข้อเสมอ
- ห้ามตัดประโยคกลางทาง
- ถ้าข้อความยาว ให้แบ่งเป็นย่อหน้าสั้น ๆ
- ถ้าเป็นหุ้น ให้มี:
  1) ภาพรวม
  2) เงินไหล / ความเสี่ยง
  3) สรุปท้าย

สไตล์:
- กระชับ เห็นภาพ
- ไม่ชี้นำซื้อขาย
`;

/* ===============================
   Helper: แยกข้อความ (ปลอดภัย LINE)
================================ */
function splitMessage(text, maxLength = 900) {
  const chunks = [];
  let buffer = '';

  text.split('\n').forEach(line => {
    if ((buffer + line).length > maxLength) {
      chunks.push(buffer.trim());
      buffer = line + '\n';
    } else {
      buffer += line + '\n';
    }
  });

  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks.map(t => ({ type: 'text', text: t }));
}

/* ===============================
   Finnhub: ราคาหุ้น
================================ */
async function getStockPrice(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   OpenAI
================================ */
async function askOpenAI(prompt) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.6
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
   LINE Webhook
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const userMessage = event.message.text.trim();
    const upper = userMessage.toUpperCase();
    let replyText = '';

    // 👉 ถ้าพิมพ์ชื่อหุ้นอย่างเดียว เช่น TSLA
    const onlySymbol = upper.match(/^[A-Z]{1,6}$/);

    if (onlySymbol) {
      const symbol = onlySymbol[0];
      const price = await getStockPrice(symbol);

      replyText = `
📊 ${symbol} — ราคาปัจจุบัน

• ราคา: ${price.c} USD
• สูงสุดวันนี้: ${price.h}
• ต่ำสุดวันนี้: ${price.l}
• ปิดก่อนหน้า: ${price.pc}

🧠 วิเคราะห์ Signal Zeeker
หุ้นอยู่ในกลุ่มที่ตลาดให้น้ำหนักสูง
ความผันผวนสะท้อน “เงินร้อน + ความคาดหวัง”

⚠️ ความเสี่ยง
ราคาแกว่งแรงตามข่าว / Sentiment
ไม่เหมาะกับคนรับแรงเหวี่ยงไม่ได้

สรุป:
${symbol} คือหุ้นเกมใหญ่
แต่ต้องดูจังหวะ ไม่ใช่อารมณ์
`;
    }

    // 👉 กรณีอื่น ใช้ AI
    else {
      replyText = await askOpenAI(userMessage);
    }

    /* ===============================
       ส่งแบบไม่ขาด (Reply + Push)
    ================================ */
    const all = splitMessage(replyText);
    const reply = all.slice(0, 5);
    const push = all.slice(5);

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      { replyToken: event.replyToken, messages: reply },
      { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
    );

    if (push.length > 0) {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        { to: event.source.userId, messages: push },
        { headers: { Authorization: `Bearer ${LINE_TOKEN}` } }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Signal Zeeker AI Bot running on port ${PORT}`)
);
