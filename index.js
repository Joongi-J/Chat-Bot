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
   MEMORY
===================================================== */
const userContext = {};

/* =====================================================
   SYSTEM PROMPT
===================================================== */
const SYSTEM_PROMPT = `
คุณคือเพื่อนนักลงทุนที่มีประสบการณ์
- คุยเป็นกันเอง
- วิเคราะห์เข้าใจง่าย
- บอกทั้งโอกาสและความเสี่ยง
- ไม่ใช้ภาษาทางการเกินไป
`;

/* =====================================================
   OPENAI SAFE CALL
===================================================== */
async function askAI(userText, useSearch = false) {
  try {
    const body = {
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText }
      ]
    };

    if (useSearch) {
      body.tools = [{ type: "web_search" }];
    }

    const res = await axios.post(
      "https://api.openai.com/v1/responses",
      body,
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
   STOCK (Finnhub)
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
   CRYPTO (Finnhub)
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
   LEVEL 3 ECONOMIC CALENDAR (AI ONLY)
===================================================== */
async function getEconomicCalendarAI() {
  try {
    const prompt = `
ดึงปฏิทินเศรษฐกิจสำคัญทั่วโลก 7 วันข้างหน้า

ตอบเป็น JSON array เท่านั้น
รูปแบบ:
[
 { "date":"YYYY-MM-DD", "country":"US", "event":"CPI", "impact":"High" }
]

impact ต้องเป็น High / Medium / Low เท่านั้น
ห้ามมีคำอธิบายอื่น
`;

    const res = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        tools: [{ type: "web_search" }],
        input: prompt
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

    // 🔥 Extract JSON safely
    const match = text.match(/\[.*\]/s);
    if (!match) {
      console.log("No JSON detected in AI response");
      return [];
    }

    const parsed = JSON.parse(match[0]);

    // 🔥 Validate + sanitize
    return parsed.map(e => ({
      date: e.date || "",
      country: e.country || "",
      event: e.event || "",
      impact: ["High","Medium","Low"].includes(e.impact)
        ? e.impact
        : "Medium"
    }));

  } catch (err) {
    console.error("AI Calendar Error:", err.message);
    return [];
  }
}

/* =====================================================
   GROUP BY IMPACT
===================================================== */
function groupByImpact(events) {
  return {
    High: events.filter(e => e.impact === "High"),
    Medium: events.filter(e => e.impact === "Medium"),
    Low: events.filter(e => e.impact === "Low")
  };
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

function buildCalendarFlex(events) {

  const grouped = groupByImpact(events);

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
            text: `${e.date} ${e.country} - ${e.event}`,
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

  /* === ECONOMIC CALENDAR === */
  if (raw.includes("ปฏิทิน") || raw.includes("ข่าว")) {

    const events = await getEconomicCalendarAI();

    if (!events.length) {
      await reply(event.replyToken, [
        { type: "text", text: "ตอนนี้ยังดึงข้อมูลปฏิทินไม่ได้ ลองใหม่อีกครั้งนะ" }
      ]);
      return res.sendStatus(200);
    }

    const flex = buildCalendarFlex(events);
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
  console.log(`🚀 SignalSeeker LEVEL 3 running on port ${PORT}`);
});
