require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ===============================
   Signal Zeeker System Prompt
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI ผู้ช่วยของเพจ Signal Zeeker

สไตล์:
- วิเคราะห์ตลาดการเงิน หุ้น การลงทุน มุมมองมหภาค
- เห็นภาพ "เงินไหล" และ "เกมอำนาจ"
- เขียนกระชับ ไม่วิชาการเกิน
- ไม่ชี้นำซื้อขายตรง ๆ
- ถ้าไม่มั่นใจ ให้บอกตรง ๆ
- ปิดท้ายด้วยสรุปสั้นแบบนักวิเคราะห์

ห้าม:
- เดา
- ให้คำแนะนำการลงทุนเฉพาะเจาะจง
- ตอบเรื่องนอกการเงิน
`;

/* ===============================
   Finnhub – Get Stock Price
================================ */
async function getStockPrice(symbol) {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/quote`,
      {
        params: {
          symbol,
          token: process.env.FINNHUB_API_KEY
        }
      }
    );

    if (!res.data || !res.data.c) return null;
    return res.data;
  } catch (err) {
    console.error('Finnhub Error:', err.response?.data || err.message);
    return null;
  }
}

/* ===============================
   OpenAI – Chat Completion
   (คุม token + fallback)
================================ */
async function callOpenAI(prompt) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini', // ประหยัด + เร็ว
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.6
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (err) {
    console.error('OpenAI Error:', err.response?.data || err.message);
    return null;
  }
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

    const userText = event.message.text.trim().slice(0, 500);

    let finalPrompt = userText;
    let aiReply = null;

    /* ===============================
       ตรวจคำสั่ง "หุ้น ราคา"
       เช่น: NVDA ราคา
    ================================ */
    const priceMatch = userText.match(/([A-Z]{2,6})\s*ราคา/i);

    if (priceMatch) {
      const symbol = priceMatch[1].toUpperCase();
      const priceData = await getStockPrice(symbol);

      if (!priceData) {
        aiReply = `❌ ไม่สามารถดึงราคาหุ้น ${symbol} ได้ในขณะนี้`;
      } else {
        finalPrompt = `
หุ้น ${symbol}

ราคา ณ ปัจจุบัน: ${priceData.c} USD
สูงสุดวันนี้: ${priceData.h}
ต่ำสุดวันนี้: ${priceData.l}
ราคาปิดก่อนหน้า: ${priceData.pc}

ช่วยวิเคราะห์มุมมองตลาดจากข้อมูลนี้
ในสไตล์ Signal Zeeker
`;
      }
    }

    /* ===============================
       เรียก OpenAI (ถ้ายังไม่มีคำตอบ)
    ================================ */
    if (!aiReply) {
      aiReply = await callOpenAI(finalPrompt);
    }

    /* ===============================
       Fallback ถ้า AI ล่ม
    ================================ */
    if (!aiReply) {
      aiReply = '⚠️ ระบบวิเคราะห์ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง';
    }

    /* ===============================
       ส่งกลับ LINE
    ================================ */
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: aiReply }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook Error:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   Start Server
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot running on port ${PORT}`);
});
