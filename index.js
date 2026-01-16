require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { buildStockFlex } = require('./flexBuilder');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* ===============================
   SYSTEM PROMPT (SMARTER)
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
คุณเป็นผู้ชาย ใช้คำว่า "ผม" และลงท้ายทุกข้อความด้วย "ครับ"

ข้อจำกัดสำคัญ:
- คุณไม่ให้คำแนะนำการลงทุน
- คุณนำเสนอข้อมูลเชิงวิเคราะห์และตัวอย่างเท่านั้น
- หากข้อมูลไม่ชัดเจน ให้บอกตรง ๆ ว่าไม่ทราบ

กรณีคำถาม:
1) ถ้าถามนอกเรื่องการเงิน → ตอบสุภาพ กระชับ
2) ถ้าขอรายชื่อหุ้น → ย้ำว่าเป็นเพียงตัวอย่าง ไม่ใช่คำแนะนำ
3) ถ้าข้อมูลเป็น Real-time ไม่ครบ → แจ้งข้อจำกัด

โครงสร้างคำตอบหุ้น:
📊 ภาพรวม
🧠 ปัจจัยสำคัญ
⚠️ ความเสี่ยง
📈 มุมมองตลาด
📌 สรุปเชิงวิเคราะห์ (พร้อม Disclaimer)
`;

/* ===============================
   Helper
================================ */
function splitForLine(text, maxLen = 900) {
  const messages = [];
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  for (const p of paragraphs) {
    if (messages.length >= 5) break;
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
   Finnhub
================================ */
async function getStockPrice(symbol) {
  try {
    const res = await axios.get(
      'https://finnhub.io/api/v1/quote',
      { params: { symbol, token: FINNHUB_API_KEY } }
    );
    if (!res.data || !res.data.c) return null;
    return res.data;
  } catch {
    return null;
  }
}

/* ===============================
   Finnhub : Top Gainers (US)
================================ */
async function getTopGainers() {
  try {
    const res = await axios.get(
      'https://finnhub.io/api/v1/stock/symbol',
      { params: { exchange: 'US', token: FINNHUB_API_KEY } }
    );

    const symbols = res.data.slice(0, 30);
    const results = [];

    for (const s of symbols) {
      const q = await getStockPrice(s.symbol);
      if (!q || !q.pc) continue;

      const pct = ((q.c - q.pc) / q.pc) * 100;
      results.push({ symbol: s.symbol, pct });
    }

    return results.sort((a, b) => b.pct - a.pct).slice(0, 5);
  } catch {
    return [];
  }
}

/* ===============================
   OpenAI
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
        temperature: 0.7,
        max_tokens: 1200
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    return res.data.choices[0].message.content;
  } catch {
    return '📌 ผมไม่สามารถประมวลผลคำตอบได้ในขณะนี้ครับ';
  }
}

/* ===============================
   LINE Webhook
================================ */
app.post('/webhook', async (req, res) => {
  const event = req.body.events?.[0];
  if (!event || event.type !== 'message') return res.sendStatus(200);

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  const isSymbol = /^[A-Za-z]{1,6}$/.test(text);
  const isTopGainer =
    /บวก|ขึ้น|แรงสุด|gainer|top/i.test(text);

  /* ===============================
     SYMBOL
  ================================ */
  if (isSymbol) {
    const symbol = text.toUpperCase();
    const q = await getStockPrice(symbol);

    if (!q) {
      await axios.post('https://api.line.me/v2/bot/message/reply', {
        replyToken,
        messages: [{ type: 'text', text: `ไม่พบข้อมูล ${symbol} ครับ` }]
      }, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });
      return res.sendStatus(200);
    }

    const flex = buildStockFlex(symbol, {
      current: q.c,
      prevClose: q.pc,
      open: q.o,
      high: q.h,
      low: q.l
    });

    await axios.post('https://api.line.me/v2/bot/message/reply', {
      replyToken,
      messages: [flex]
    }, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });

    return res.sendStatus(200);
  }

  /* ===============================
     TOP GAINERS
  ================================ */
  if (isTopGainer) {
    const gainers = await getTopGainers();
    const textMsg = gainers.length
      ? gainers.map((g, i) => `${i + 1}. ${g.symbol} +${g.pct.toFixed(2)}%`).join('\n')
      : 'ไม่สามารถดึงข้อมูลได้ครับ';

    await axios.post('https://api.line.me/v2/bot/message/reply', {
      replyToken,
      messages: [{
        type: 'text',
        text:
`📈 หุ้นที่บวกแรงวันนี้ (US)
${textMsg}

📌 ข้อมูลนี้เป็นเพียงการนำเสนอข้อมูล ไม่ใช่คำแนะนำการลงทุนครับ`
      }]
    }, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });

    return res.sendStatus(200);
  }

  /* ===============================
     AI GENERAL
  ================================ */
  const aiText = await askOpenAI(text);
  const messages = splitForLine(aiText);

  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken,
    messages
  }, { headers: { Authorization: `Bearer ${LINE_TOKEN}` } });

  res.sendStatus(200);
});

/* ===============================
   Server
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
