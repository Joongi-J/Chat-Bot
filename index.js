require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ===============================
   CONFIG
================================ */
const OPENAI_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 500;
const TEMPERATURE = 0.6;

/* ===============================
   SYSTEM PROMPT
================================ */
const SYSTEM_PROMPT = `
คุณคือ AI ผู้ช่วยของเพจ Signal Zeeker

สไตล์:
- วิเคราะห์ตลาดการเงิน หุ้น การลงทุน
- เห็นภาพ "เงินไหล" และ "เกมอำนาจ"
- ใช้ Elliott Wave + Price Action เชิงโครงสร้าง
- ไม่ฟันธง ไม่ชี้นำซื้อขาย
- ถ้าไม่มั่นใจ ให้บอกตรง ๆ
- ปิดท้ายด้วย summary สั้น

ห้าม:
- เดา
- ให้จุดซื้อขายตายตัว
- ตอบนอกเรื่องการเงิน
`;

/* ===============================
   HELPERS
================================ */

// ตรวจ intent แบบง่าย
function isPriceOnlyQuestion(text) {
  return /ราคา|price|เท่าไหร่|ตอนนี้/i.test(text) && text.length < 20;
}

// ดึงราคา realtime
async function getQuote(symbol) {
  const res = await axios.get(
    `https://finnhub.io/api/v1/quote`,
    {
      params: {
        symbol,
        token: process.env.FINNHUB_API_KEY
      }
    }
  );
  return res.data;
}

// ดึง OHLC
async function getCandles(symbol) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 60 * 24 * 120; // 120 วัน

  const res = await axios.get(
    `https://finnhub.io/api/v1/stock/candle`,
    {
      params: {
        symbol,
        resolution: 'D',
        from,
        to,
        token: process.env.FINNHUB_API_KEY
      }
    }
  );
  return res.data;
}

// วิเคราะห์โครงสร้างราคาแบบ rule-based
function analyzeStructure(candles) {
  const highs = candles.h.slice(-20);
  const lows = candles.l.slice(-20);

  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);

  const lastClose = candles.c[candles.c.length - 1];

  const trend =
    lastClose > candles.c[candles.c.length - 10]
      ? 'Higher High / Higher Low'
      : 'Sideway / Corrective';

  return {
    trend,
    recentHigh,
    recentLow,
    lastClose,
    volatility: 'สูง',
    timeframe: 'Daily'
  };
}

// ส่งข้อความหลาย bubble
async function replyLine(replyToken, texts) {
  const messages = texts.map(t => ({ type: 'text', text: t }));

  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

/* ===============================
   LINE WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') {
      return res.sendStatus(200);
    }

    const userText = event.message.text.trim();
    const symbolMatch = userText.match(/[A-Z]{2,5}/);
    const symbol = symbolMatch ? symbolMatch[0] : null;

    if (!symbol) {
      await replyLine(event.replyToken, [
        'กรุณาระบุสัญลักษณ์หุ้น เช่น TSLA, AAPL'
      ]);
      return res.sendStatus(200);
    }

    /* ====== ราคาอย่างเดียว ====== */
    if (isPriceOnlyQuestion(userText)) {
      const quote = await getQuote(symbol);

      await replyLine(event.replyToken, [
        `📊 ${symbol} ราคาปัจจุบัน`,
        `• Last: $${quote.c}
• High: $${quote.h}
• Low: $${quote.l}
• Prev Close: $${quote.pc}`
      ]);

      return res.sendStatus(200);
    }

    /* ====== วิเคราะห์เชิงลึก ====== */
    const candles = await getCandles(symbol);
    if (candles.s !== 'ok') {
      throw new Error('ไม่สามารถดึงข้อมูลราคาได้');
    }

    const structure = analyzeStructure(candles);

    const prompt = `
ข้อมูลตลาด ${symbol}:

โครงสร้างราคา:
- Trend: ${structure.trend}
- High ล่าสุด: ${structure.recentHigh}
- Low ล่าสุด: ${structure.recentLow}
- Last Close: ${structure.lastClose}
- Volatility: ${structure.volatility}
- Timeframe: ${structure.timeframe}

โจทย์:
1) ประเมิน Elliott Wave ว่าอยู่ในเฟสใด (เชิงโครงสร้าง)
2) ระบุแนวรับ-แนวต้านจาก price action
3) วาง 2 scenario (bullish / corrective)
4) เขียนสไตล์ Signal Zeeker
5) ปิดท้ายด้วย summary สั้น
`;

    let aiText = '';

    try {
      const aiRes = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      aiText = aiRes.data.choices[0].message.content;
    } catch (err) {
      aiText = `
⚠️ ระบบวิเคราะห์อัตโนมัติขัดข้องชั่วคราว

โครงสร้างราคา ${symbol}:
- Trend: ${structure.trend}
- Range: ${structure.recentLow} – ${structure.recentHigh}

สรุป:
ตลาดยังอยู่ในโหมด "รอเลือกทาง"
จับตา reaction ที่แนวรับ-แนวต้านสำคัญ
`;
    }

    // แยกข้อความเป็นหลายส่วน
    const chunks = aiText.match(/[\s\S]{1,900}/g);

    await replyLine(event.replyToken, chunks.slice(0, 3));

    res.sendStatus(200);
  } catch (err) {
    console.error('ERROR:', err.message);
    res.sendStatus(500);
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`Signal Zeeker AI Bot running on port ${PORT}`);
});
