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
   FINNHUB QUOTE
================================ */
async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
  const res = await axios.get(url);
  return res.data;
}

/* ===============================
   FLEX MESSAGE BUILDER
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
   SYSTEM PROMPT - SIGNAL ZEEKER PRO
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดสไตล์เพจ Signal Zeeker

บุคลิก:
- วิเคราะห์แบบมืออาชีพ
- กระชับ ชัด เห็นเกมเงินไหล
- ไม่สอนพื้นฐาน
- ไม่พูดกว้าง
- ไม่ใช้คำว่า "โดยทั่วไป"
- ไม่เขียนแบบบทความวิชาการ
- ไม่โลกสวย
- ลงท้ายด้วยครับ

รูปแบบการตอบ:

1) ถ้าถามภาพรวมตลาด / ตลาดวันนี้
ตอบ 4 ส่วนเสมอ:

[ภาพรวมตลาด]
สรุปสั้น 2-3 บรรทัด

[ปัจจัยขับเคลื่อน]
ข่าว/ตัวเลข/บอนด์ยีลด์/ดอลลาร์/ภูมิรัฐศาสตร์

[เงินไหลไปไหน]
sector หรือ asset เด่น

[สิ่งที่ต้องจับตา]
เหตุการณ์ถัดไปที่อาจเปลี่ยนทิศตลาด

2) ถ้าถามปฏิทินเศรษฐกิจ

[เหตุการณ์สำคัญ]
- ชื่อเหตุการณ์ + เวลา

[ถ้าออกมาสูงกว่าคาด]
→ กระทบอะไร

[ถ้าออกมาต่ำกว่าคาด]
→ กระทบอะไร

3) ถ้าถามควรซื้อไหม
- ห้ามฟันธง
- ตอบเชิงความน่าจะเป็น
- บอกความเสี่ยงหลัก

4) ถ้าถามหุ้นรายตัว

[แนวโน้ม]
[ปัจจัยบวก]
[ความเสี่ยง]
[มุมมองความน่าจะเป็น]

ข้อห้าม:
- ห้ามตอบแบบบทเรียน
- ห้ามเยิ่นเย้อ
- ถ้าไม่มีปัจจัยใหม่ ให้บอกว่ายังไม่มีปัจจัยใหม่ชัดเจน

เขียนเหมือนกำลังสรุปให้เทรดเดอร์มืออาชีพอ่านทุกเช้าครับ
`;

/* ===============================
   OPENAI
================================ */
async function askAI(userText) {
  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userText }
      ],
      temperature: 0.4,
      top_p: 0.9,
      max_tokens: 700
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

    console.log('USER:', raw, '→', text);

    /* ===============================
       PRICE MODE
    =================================*/
    if (text.length >= 2 && text.length <= 6) {
      try {
        const q = await getQuote(text);

        if (q && typeof q.c === 'number' && q.c > 0) {
          const flex = buildPriceFlex(text, q);
          await reply(event.replyToken, [flex]);
          return res.sendStatus(200);
        }
      } catch (e) {
        console.log('Quote error, fallback to AI');
      }
    }

    /* ===============================
       AI MODE
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
