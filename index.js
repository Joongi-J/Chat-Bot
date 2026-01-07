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
   LINE Webhook
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') {
      return res.sendStatus(200);
    }

    const userMessage = event.message.text.slice(0, 1000); // กันข้อความยาว

    // === เรียก OpenAI ===
    const aiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
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

    const replyText =
      aiResponse.data.choices?.[0]?.message?.content ||
      'ขออภัย ระบบยังประมวลผลไม่ได้ตอนนี้';

    // === ส่งกลับ LINE ===
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: replyText }]
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
    console.error('ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   Start Server
================================ */
app.listen(PORT, () => {
  console.log(`Signal Zeeker AI Bot running on port ${PORT}`);
});
