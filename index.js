require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* =====================================================
   SIMPLE MEMORY (IN-MEMORY CONTEXT)
===================================================== */
const userContext = {};

/* =====================================================
   SYSTEM PROMPT (Friendly Investor Mode)
===================================================== */
const SYSTEM_PROMPT = `
คุณคือเพื่อนนักลงทุนที่มีประสบการณ์
- คุยเป็นกันเอง ไม่แข็ง ไม่ทางการ
- วิเคราะห์เข้าใจง่าย
- ชี้ทั้งโอกาสและความเสี่ยง
- ถ้าเป็นคำทักทาย ตอบสั้น ๆ แบบอบอุ่น
- ถ้าเป็นตลาด ใช้ข้อมูลล่าสุด
`;

/* =====================================================
   OPENAI SAFE CALL
===================================================== */
async function askAI(userText) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/responses',
      {
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    let text = "";
    res.data.output?.forEach(o => {
      o.content?.forEach(c => {
        if (c.type === "output_text") text += c.text;
      });
    });

    return text.trim() || "ขอเวลาหาข้อมูลแป๊บนะ เดี๋ยวสรุปให้ใหม่";

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return "ช่วงนี้ข้อมูลอาจหน่วงนิดนึง ลองใหม่อีกครั้งนะ";
  }
}

/* =====================================================
   FINNHUB STOCK
===================================================== */
async function getQuote(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
}

/* =====================================================
   FINNHUB CRYPTO
===================================================== */
async function getCryptoQuote(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/crypto/quote?symbol=BINANCE:${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
}

/* =====================================================
   ECONOMIC CALENDAR
===================================================== */
async function getEconomicCalendar() {
  try {
    const today = new Date();
    const next7 = new Date();
    next7.setDate(today.getDate() + 7);

    const from = today.toISOString().split('T')[0];
    const to = next7.toISOString().split('T')[0];

    const url = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);

    return (res.data.economicCalendar || []).slice(0, 15);

  } catch (err) {
    console.error("Calendar Error:", err.message);
    return [];
  }
}

function groupByImpact(events) {
  return {
    High: events.filter(e => e.impact === "High"),
    Medium: events.filter(e => e.impact === "Medium"),
    Low: events.filter(e => e.impact === "Low")
  };
}

async function summarizeWeek(events) {
  const textData = events.map(e =>
    `${e.date} ${e.country} ${e.event} (${e.impact})`
  ).join("\n");

  return await askAI(`
นี่คือเหตุการณ์เศรษฐกิจสัปดาห์นี้:
${textData}

สรุปภาพรวมแนวโน้มตลาด 3-4 บรรทัด แบบเพื่อนนักลงทุน
`);
}

/* =====================================================
   FLEX BUILDERS
===================================================== */
function buildPriceFlex(symbol, q) {
  const change = q.d || 0;
  const pct = q.dp || 0;
  const up = change >= 0;

  return {
    type: "flex",
    altText: `${symbol} $${q.c}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: symbol, weight: "bold", size: "xl" },
          {
            type: "text",
            text: `$${q.c}`,
            size: "xxl",
            weight: "bold",
            color: up ? "#16A34A" : "#DC2626"
          },
          {
            type: "text",
            text: `${up ? "▲" : "▼"} ${change.toFixed(2)} (${pct.toFixed(2)}%)`,
            size: "sm"
          }
        ]
      }
    }
  };
}

function buildCalendarCarousel(summary, grouped) {

  function bubble(title, events, color) {
    return {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: title, weight: "bold", size: "lg", color },
          ...events.slice(0,5).map(e => ({
            type: "text",
            text: `${e.date} - ${e.event}`,
            size: "xs",
            wrap: true
          }))
        ]
      }
    };
  }

  return {
    type: "flex",
    altText: "Economic Calendar",
    contents: {
      type: "carousel",
      contents: [
        {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "📊 ภาพรวมสัปดาห์", weight: "bold", size: "lg" },
              { type: "text", text: summary, size: "sm", wrap: true }
            ]
          }
        },
        bubble("🔥 High Impact", grouped.High, "#DC2626"),
        bubble("⚡ Medium Impact", grouped.Medium, "#F59E0B"),
        bubble("🟢 Low Impact", grouped.Low, "#16A34A")
      ]
    }
  };
}

/* =====================================================
   LINE REPLY
===================================================== */
async function reply(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

/* =====================================================
   WEBHOOK
===================================================== */
app.post("/webhook", async (req, res) => {

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") return res.sendStatus(200);

  const raw = event.message.text.trim();
  const text = raw.toUpperCase();
  const userId = event.source.userId;

  userContext[userId] = raw;

  console.log("USER:", raw);

  /* === ECONOMIC MODE === */
  if (raw.includes("ปฏิทิน") || raw.includes("เศรษฐกิจ")) {

    const events = await getEconomicCalendar();

    if (!events.length) {
      await reply(event.replyToken, [
        { type: "text", text: "สัปดาห์นี้ดูเงียบ ๆ ยังไม่มีตัวเลขแรง ๆ เท่าไหร่" }
      ]);
      return res.sendStatus(200);
    }

    const grouped = groupByImpact(events);
    const summary = await summarizeWeek(events);
    const flex = buildCalendarCarousel(summary, grouped);

    await reply(event.replyToken, [flex]);
    return res.sendStatus(200);
  }

  /* === CRYPTO === */
  if (/^[A-Z]{3,10}USDT$/.test(text)) {
    const q = await getCryptoQuote(text);
    if (q?.c > 0) {
      await reply(event.replyToken, [buildPriceFlex(text, q)]);
      return res.sendStatus(200);
    }
  }

  /* === STOCK === */
  if (/^[A-Z]{1,6}$/.test(text)) {
    const q = await getQuote(text);
    if (q?.c > 0) {
      await reply(event.replyToken, [buildPriceFlex(text, q)]);
      return res.sendStatus(200);
    }
  }

  /* === AI GENERAL === */
  const aiText = await askAI(raw);
  await reply(event.replyToken, [{ type: "text", text: aiText }]);

  res.sendStatus(200);
});

/* =====================================================
   SERVER
===================================================== */
app.listen(PORT, () => {
  console.log(`🚀 SignalSeeker Level 2 running on port ${PORT}`);
});
