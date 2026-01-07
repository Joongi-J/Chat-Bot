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
คุณคือ AI ผู้ช่วยของเพจ Signal Zeeker

แนวทาง:
- วิเคราะห์ตลาด หุ้น การลงทุน
- เห็นภาพ "เงินไหล" และ "เกมอำนาจ"
- กระชับ อ่านง่าย ไม่วิชาการ
- ห้ามชี้นำซื้อขายตรง
- ถ้าไม่มีข้อมูลจริง ให้บอกตรง ๆ

ปิดท้ายด้วยสรุปสั้นแบบนักวิเคราะห์
`;

/* ===============================
   Helper: แยกข้อความยาว (ปลอดภัย LINE)
================================ */
function splitMessage(text, maxLength = 900) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    chunks.push(text.substring(start, start + maxLength));
    start += maxLength;
  }

  return chunks.map(t => ({ type: 'text', text: t.trim() }));
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
   OpenAI (คุม token)
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
      max_tokens: 350,
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
      return res.sendStatus(500);
    }

    const userMessage = event.message.text.trim();
    const upperMsg = userMessage.toUpperCase();
    let replyText = '';

    /* ===== CASE: ถามราคา ===== */
    const priceMatch = upperMsg.match(/^([A-Z]{1,6})\s*(ราคา|PRICE)/);

    if (priceMatch) {
      const symbol = priceMatch[1];

      try {
        const price = await getStockPrice(symbol);

        if (!price || price.c === 0) {
          replyText = `ไม่พบข้อมูลราคาปัจจุบันของ ${symbol}`;
        } else {
          replyText = `
📊 ${symbol} — ราคาปัจจุบัน

• ราคา: ${price.c} USD
• สูงสุดวันนี้: ${price.h}
• ต่ำสุดวันนี้: ${price.l}
• ปิดก่อนหน้า: ${price.pc}

🧠 มุมมอง Signal Zeeker:
ราคาคือผลลัพธ์ระยะสั้น
แต่ทิศทางจริงดูที่ “เงินไหล”

สรุป:
อย่าดูราคาเดี่ยว ๆ
ต้องดูพฤติกรรมทุนประกอบ
`;
        }
      } catch {
        replyText = 'ระบบดึงราคาหุ้นขัดข้องชั่วคราว';
      }
    }

    /* ===== CASE: วิเคราะห์ทั่วไป ===== */
    else {
      try {
        replyText = await askOpenAI(userMessage);
      } catch {
        replyText = 'ระบบ AI ขัดข้องชั่วคราว';
      }
    }

    /* ===============================
       ส่งข้อความแบบไม่ขาด (Reply + Push)
    ================================ */
    const allMessages = splitMessage(replyText);
    const replyMessages = allMessages.slice(0, 5);
    const pushMessages = allMessages.slice(5);

    // 🔹 Reply (สูงสุด 5)
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: replyMessages
      },
      {
        headers: {
          Authorization: `Bearer ${LINE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 🔹 Push ต่อถ้ามีเกิน
    if (pushMessages.length > 0) {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: event.source.userId,
          messages: pushMessages
        },
        {
          headers: {
            Authorization: `Bearer ${LINE_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    res.sendStatus(500);
  } catch (err) {
    console.error('ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   Start Server
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot running on port ${PORT}`);
});
