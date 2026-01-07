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
   Signal Zeeker System Prompt
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ของเพจ Signal Zeeker

รูปแบบคำตอบ:
- แยกเป็นหัวข้อชัดเจน
- เห็นภาพเงินไหล / sentiment ตลาด
- ไม่ชี้นำซื้อขาย
- ใช้ภาษาข่าว วิเคราะห์แบบมืออาชีพ
- ปิดท้ายด้วย "สรุปมุมมอง"

แต่ละหัวข้อเว้น 2 บรรทัด
`;

/* ===============================
   Helper: แยกเป็นกล่องข่าว LINE
================================ */
function toLineNewsMessages(text, limit = 5) {
  const sections = text
    .split(/\n{2,}/) // เว้น 2 บรรทัด = กล่องใหม่
    .map(t => t.trim())
    .filter(Boolean);

  return sections.slice(0, limit).map(sec => ({
    type: 'text',
    text: sec
  }));
}

/* ===============================
   Helper: ดึงราคาหุ้น Finnhub
================================ */
async function getStockPrice(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   Helper: OpenAI
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
    if (!event || event.type !== 'message') {
      return res.sendStatus(200);
    }

    const userMessage = event.message.text.trim().toUpperCase();
    let replyText = '';

    /* ===== CASE: พิมพ์ชื่อหุ้นอย่างเดียว ===== */
    if (/^[A-Z]{1,6}$/.test(userMessage)) {
      const symbol = userMessage;

      const price = await getStockPrice(symbol);

      replyText = `
📊 ${symbol} — ราคาปัจจุบัน

• ราคา: ${price.c} USD
• สูงสุดวันนี้: ${price.h}
• ต่ำสุดวันนี้: ${price.l}
• ปิดก่อนหน้า: ${price.pc}


🧠 ภาพรวมตลาด

ราคาสะท้อนความคาดหวังของนักลงทุน
แรงซื้อ–ขายยังขึ้นกับ sentiment ระยะสั้น


⚠️ ความเสี่ยงที่ต้องจับตา

หุ้นมีความผันผวนสูง
ข่าวและงบการเงินมีผลต่อราคาอย่างมาก


📌 สรุปมุมมอง Signal Zeeker

ราคาเป็นผลลัพธ์
ทิศทางจริงอยู่ที่ “เงินไหล”
`;

    } else {
      /* ===== วิเคราะห์ทั่วไป ===== */
      replyText = await askOpenAI(event.message.text);
    }

    /* ===== แยกเป็นหลายกล่องข่าว ===== */
    const messages = toLineNewsMessages(replyText);

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages
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
    console.error('ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   Start Server
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot (News Style) running on port ${PORT}`);
});
