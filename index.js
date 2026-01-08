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
   SYSTEM PROMPT (ออกแบบเพื่อ LINE)
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker

กติกาสำคัญ (ต้องทำตาม):
- เขียนเหมือนบทวิเคราะห์สำนักข่าว
- แยกเป็นหัวข้อชัดเจน (ใช้ emoji นำ)
- 1 หัวข้อ = 1 ย่อหน้า (ไม่เกิน 600 ตัวอักษรต่อย่อหน้า)
- ห้ามใช้ bullet ยาว
- ห้ามชี้นำซื้อขายตรง
- Elliott Wave ให้ใช้คำว่า "โครงสร้าง", "คลื่นที่เป็นไปได้"
- แนวรับแนวต้านให้เรียกว่า "โซน"
- ถ้าเป็นการประเมิน ให้ระบุว่าเป็นมุมมองเชิงเทคนิค

โครงสร้างคำตอบ (ต้องมีทุกข้อ):
📊 ภาพรวมราคา
📈 Elliott Wave & โครงสร้าง
📐 แนวรับแนวต้าน
📉 Indicator (RSI / EMA / VWAP)
🧠 มุมมองตลาด
📌 สรุป Signal Zeeker
`;

/* ===============================
   LINE SAFE SPLIT (ไม่ตัด ไม่หาย)
================================ */
function buildLineMessages(sections) {
  return sections
    .map(text => ({
      type: 'text',
      text: text.trim().slice(0, 950)
    }))
    .slice(0, 8);
}

/* ===============================
   Finnhub: Candle
================================ */
async function getCandles(symbol, resolution = 'D', days = 120) {
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86400;
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);

    if (res.data.s !== 'ok') throw new Error('No candle data');
    return res.data;
  } catch (err) {
    console.error('Finnhub ERROR:', err.response?.data || err.message);
    throw err;
  }
}

/* ===============================
   Indicator Calculations
================================ */
function EMA(values, period) {
  if (values.length < period) period = values.length;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function RSI(values, period = 14) {
  if (values.length < period) period = values.length - 1;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length - 1; i++) {
    const diff = values[i + 1] - values[i];
    diff >= 0 ? gains += diff : losses -= diff;
  }
  const rs = gains / (losses || 1);
  return (100 - 100 / (1 + rs)).toFixed(2);
}

function VWAP(candles) {
  let pv = 0, vol = 0;
  for (let i = 0; i < candles.c.length; i++) {
    pv += candles.c[i] * candles.v[i];
    vol += candles.v[i];
  }
  return (pv / vol).toFixed(2);
}

/* ===============================
   วิเคราะห์ SR + Structure
================================ */
function analyzeStructure(candles) {
  const highs = candles.h.slice(-30);
  const lows = candles.l.slice(-30);

  return {
    resistance: Math.max(...highs).toFixed(2),
    support: Math.min(...lows).toFixed(2)
  };
}

/* ===============================
   LINE WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const userText = event.message.text.trim();
    const isSymbolOnly = /^[A-Za-z]{1,6}$/.test(userText);

    let sections = [];

    /* ===== พิมพ์ชื่อหุ้น ===== */
    if (isSymbolOnly) {
      const symbol = userText.toUpperCase();

      const daily = await getCandles(symbol, 'D', 180);
      const intraday = await getCandles(symbol, '60', 10);

      const close = daily.c[daily.c.length - 1];
      const ema50 = EMA(daily.c.slice(-60), 50).toFixed(2);
      const ema200 = EMA(daily.c.slice(-220), 200).toFixed(2);
      const rsi = RSI(daily.c);
      const vwap = VWAP(intraday);
      const sr = analyzeStructure(daily);

      sections = [
        `📊 ${symbol} ภาพรวมราคา  
ราคาปัจจุบันเคลื่อนไหวบริเวณ ${close} ดอลลาร์ โดยโครงสร้างระยะกลางยังอยู่ในช่วงการสะสมแรงหลังการเคลื่อนไหวรอบก่อนหน้า ซึ่งสะท้อนการชะลอความเร็วของแนวโน้มหลัก`,

        `📈 Elliott Wave & โครงสร้าง  
รูปแบบราคาใน Timeframe หลักมีลักษณะของโครงสร้างปรับฐานมากกว่าคลื่นส่ง โดยการไม่ทำ Higher High ต่อเนื่อง บ่งชี้ว่าตลาดอาจอยู่ในช่วงคลื่นพักฐานเชิงโครงสร้างก่อนเลือกทิศทางใหม่`,

        `📐 แนวรับแนวต้าน  
โซนแนวต้านสำคัญอยู่บริเวณ ${sr.resistance} ดอลลาร์ ขณะที่โซนแนวรับหลักอยู่แถว ${sr.support} ดอลลาร์ ซึ่งเป็นบริเวณที่แรงซื้อเคยกลับเข้ามาอย่างมีนัยสำคัญ`,

        `📉 Indicator  
RSI ล่าสุดอยู่ที่ ${rsi} สะท้อนโมเมนตัมที่เริ่มชะลอ ขณะที่ EMA50 (${ema50}) และ EMA200 (${ema200}) ยังเป็นระดับที่ตลาดใช้เป็นจุดอ้างอิง ส่วน VWAP ระยะสั้นอยู่ที่ ${vwap}`,

        `🧠 มุมมองตลาด  
พฤติกรรมราคาสะท้อนภาวะรอปัจจัยใหม่จากตลาด การเคลื่อนไหวในกรอบแคบมักเกิดในช่วงที่ผู้เล่นรายใหญ่ยังไม่เปิดไพ่`,

        `📌 สรุป Signal Zeeker  
ราคาคือผลลัพธ์ แต่โครงสร้างคือสิ่งที่ต้องจับตา การเคลื่อนไหวใกล้โซนสำคัญจะเป็นตัวบอกเกมถัดไปของตลาด`
      ];
    } 
    /* ===== คำถามทั่วไป ===== */
    else {
      try {
        const ai = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userText }
            ],
            max_tokens: 900,
            temperature: 0.6
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        sections = ai.data.choices[0].message.content
          .split(/\n(?=📊|📈|📐|📉|🧠|📌)/)
          .filter(Boolean);
      } catch (err) {
        console.error('OpenAI ERROR:', err.response?.data || err.message);
        sections = ['📌 เกิดข้อผิดพลาดในการประมวลผลคำถาม AI กรุณาลองใหม่'];
      }
    }

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken: event.replyToken,
        messages: buildLineMessages(sections)
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
    console.error('SERVER ERROR:', err.response?.data || err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Signal Zeeker AI Bot (Elliott + PA) running on port ${PORT}`);
});
