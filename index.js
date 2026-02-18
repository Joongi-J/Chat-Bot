require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* =====================================================
   SYSTEM PROMPT
===================================================== */
const SYSTEM_PROMPT = `
คุณคือเพื่อนนักลงทุนสายวิเคราะห์
- คุยเป็นกันเอง เหมือนเพื่อนให้คำแนะนำ
- วิเคราะห์เข้าใจง่าย
- บอกทั้งโอกาสและความเสี่ยง
- ถ้าต้องค้นข้อมูลปัจจุบัน ให้ใช้ web search tool
- ห้ามตอบแข็งหรือเป็นทางการเกินไป
`;

/* =====================================================
   OPENAI CALL (รองรับ Web Search จริง)
===================================================== */
async function askAI(userText, useSearch = false, forceJSON = false) {
  try {

    const body = {
      model: "gpt-4.1",
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: userText
        }
      ]
    };

    // 🔥 เปิด Web Search Tool จริง
    if (useSearch) {
      body.tools = [{ type: "web_search" }];
      body.tool_choice = "auto";
    }

    // 🔥 บังคับ JSON ถ้าต้องการ
    if (forceJSON) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: "calendar_schema",
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                country: { type: "string" },
                event: { type: "string" },
                impact: { type: "string" }
              },
              required: ["date","country","event","impact"]
            }
          }
        }
      };
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

    /* ===============================
       ถ้าเป็น JSON mode
    =============================== */
    if (forceJSON) {
      return res.data.output_parsed || [];
    }

    /* ===============================
       ปกติรวมข้อความทั้งหมด
    =============================== */
    let text = "";

    res.data.output?.forEach(o => {
      o.content?.forEach(c => {
        if (c.type === "output_text") {
          text += c.text;
        }
      });
    });

    return text.trim() || "ขอเวลาหาข้อมูลแป๊บนะ เดี๋ยวสรุปให้ใหม่";

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return forceJSON ? [] : "ช่วงนี้ข้อมูลอาจหน่วงนิดนึง ลองใหม่อีกครั้งนะ";
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
   ECONOMIC CALENDAR (AI + WEB SEARCH จริง)
===================================================== */
async function getEconomicCalendar() {

  const prompt = `
ค้นหาปฏิทินเศรษฐกิจสำคัญทั่วโลก 7 วันข้างหน้า

ดึงเฉพาะเหตุการณ์ที่มีผลต่อตลาดการเงิน
impact ต้องเป็น High / Medium / Low เท่านั้น

ตอบเป็น JSON array เท่านั้น
`;

  return await askAI(prompt, true, true);
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
   FLEX PRICE
===================================================== */
function buildPriceFlex(symbol, q) {
  const change = q.d || 0;
  const pct = q.dp || 0;
  const up = change >= 0;

  return {
    type: "flex",
    altText: `${symbol} ${q.c}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: symbol, weight: "bold", size: "xl" },
          {
            type: "text",
            text: `${q.c}`,
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

/* =====================================================
   FLEX CALENDAR
===================================================== */
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

  console.log("USER:", raw);

  /* ================= ECONOMIC CALENDAR ================= */
  if (raw.includes("ปฏิทิน") || raw.includes("ข่าว")) {

    const events = await getEconomicCalendar();

    if (!events.length) {
      await reply(event.replyToken, [
        { type: "text", text: "ตอนนี้ยังดึงปฏิทินไม่ได้ เดี๋ยวลองใหม่ให้นะ" }
      ]);
      return res.sendStatus(200);
    }

    await reply(event.replyToken, [buildCalendarFlex(events)]);
    return res.sendStatus(200);
  }

  /* ================= CRYPTO ================= */
  if (/^[A-Z]{3,10}USDT$/.test(text)) {
    const q = await getCryptoQuote(text);
    if (q?.c > 0) {
      await reply(event.replyToken, [buildPriceFlex(text, q)]);
      return res.sendStatus(200);
    }
  }

  /* ================= STOCK ================= */
  if (/^[A-Z]{1,6}$/.test(text)) {
    const q = await getQuote(text);
    if (q?.c > 0) {
      await reply(event.replyToken, [buildPriceFlex(text, q)]);
      return res.sendStatus(200);
    }
  }

  /* ================= AI GENERAL (Web Search Auto) ================= */
  const aiText = await askAI(raw, true, false);
  await reply(event.replyToken, [{ type: "text", text: aiText }]);

  res.sendStatus(200);
});

/* =====================================================
   SERVER
===================================================== */
app.listen(PORT, () => {
  console.log(`🚀 SignalSeeker AI + WebSearch running on port ${PORT}`);
});
