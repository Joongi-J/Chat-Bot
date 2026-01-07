require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===============================
   System Prompt (Signal Zeeker)
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI ผู้ช่วยของเพจ Signal Zeeker

สไตล์:
- วิเคราะห์ตลาดการเงิน หุ้น การลงทุน มุมมองมหภาค
- เห็นภาพ "เงินไหล" และ "เกมอำนาจ"
- เขียนกระชับ ไม่วิชาการเกิน
- ไม่ชี้นำซื้อขายตรง ๆ
- ถ้าไม่มั่นใจ ให้บอกตรง ๆ
- ปิดท้ายด้วย "สรุปสั้นแบบนักวิเคราะห์"

ห้าม:
- เดา
- ให้คำแนะนำซื้อขายตรง
- ตอบเรื่องนอกการเงิน
`;

/* ===============================
   Helper: Split LINE message
================================ */
function splitMessage(text, maxLength = 4000) {
  const chunks = [];
  let current = '';

  text.split('\n').forEach(line => {
    if ((current + line + '\n').length > maxLength) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  });

  if (current.trim()) chunks.push(current);
  return chunks.slice(0, 5); // LINE ส่งได้สูงสุด 5
}

/* ===============================
   Helper: Detect price intent
================================ */
function extractTicker(text) {
  const match = text.match(/\b[A-Z]{2,5}\b/);
  return match ? match[0] : null;
}

/* ===============================
   Helper: Get price from Finnhub
================================ */
async function getStockPrice(symbol) {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );

    if (!res.data || res.data.c === 0) return null;

    return {
      price: res.data.c,
      change: res.data.d,
      percent: res.data.dp
    };
  } catch (err) {
    return null;
  }
}

/* ===============================
   LINE Webhook
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message' || event.message.type !== 'text') {
      return res.sendStatus(200);
    }

    const userText = event.message.text.slice(0, 500);
    let finalPrompt = userText;

    /* === ถามราคาหุ้น → ดึงข้อมูลจริง === */
    const ticker = extractTicker(userText);
    if (ticker && FINNHUB_API_KEY) {
      const priceData = await getStockPrice(ticker);
      if (priceData) {
        finalPrompt = `
ราคาปัจจุบันของ ${ticker}:
- ราคา: ${priceData.price}
- เปลี่ยนแปลง: ${priceData.change} (${priceData.percent}%)

ช่วยวิเคราะห์สถานการณ์หุ้น ${ticker}
โดยเชื่อมโยงกับมุมมองเงินไหลและภาพตลาด
`;
      }
    }

    /* === เรียก OpenAI === */
    let aiText = '';
    try {
      const aiRes = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: finalPrompt }
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

      aiText = aiRes.data.choices?.[0]?.message?.content;
    } catch (err) {
      console.error('OpenAI Error:', err.response?.data || err.message);
      aiText = `
ตอนนี้ระบบ AI มีปัญหาชั่วคราว
แต่ข้อมูลตลาดยังต้องจับตาอย่างใกล้ชิด

สรุป:
ความผันผวนยังสูง อย่าด่วนตัดสินใจ
`;
    }

    if (!aiText) aiText = 'ระบบไม่สามารถประมวลผลได้ในขณะนี้';

    /* === แบ่งข้อความก่อนส่ง LINE === */
    const messages = splitMessage(aiText).map(t => ({
      type: 'text',
      text: t
    }));

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
    console.error('Webhook Error:', err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   Start Server
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot running on port ${PORT}`);
});
