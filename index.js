require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/* =====================================================
   MEMORY SYSTEM
===================================================== */
const userMemory = {};
const MAX_MEMORY = 12;

/* =====================================================
   CLEAN DESK SYSTEM PROMPT (NO TEMPLATE SMELL)
===================================================== */
const SYSTEM_PROMPT = `
คุณคือ Senior Trader ใน Hedge Fund

ตอบเหมือน internal desk chat
ไม่ใช้หัวข้อ
ไม่ใช้วงเล็บ
ไม่จัดโครงสร้างรายงาน
ไม่ทำเป็นบทความ

ห้ามใส่ลิงก์
ห้ามอ้างแหล่งข่าว
ห้ามเขียนเหมือนบทวิเคราะห์เว็บไซต์

โทน:
สุขุม กระชับ มี conviction
ถ้าไม่ชัด ให้บอกว่ายังไม่ชัด
ถ้าเป็นข้อมูลล่าสุด ใช้ web_search แต่ห้ามแนบลิงก์
`;

/* =====================================================
   LINK SANITIZER (กันลิงก์หลุด)
===================================================== */
function removeLinks(text) {
  return text.replace(/https?:\/\/\S+/g, "").trim();
}

/* =====================================================
   OPENAI CALL
===================================================== */
async function askAI(userId, text, useSearch = false) {
  try {

    if (!userMemory[userId]) {
      userMemory[userId] = [];
    }

    userMemory[userId].push({ role: "user", content: text });

    if (userMemory[userId].length > MAX_MEMORY) {
      userMemory[userId].shift();
    }

    const body = {
      model: "gpt-4.1",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        ...userMemory[userId]
      ]
    };

    if (useSearch) {
      body.tools = [{ type: "web_search" }];
      body.tool_choice = "auto";
    }

    const res = await axios.post(
      "https://api.openai.com/v1/responses",
      body,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    let outputText = "";

    for (const item of res.data.output || []) {
      for (const part of item.content || []) {
        if (part.type === "output_text") {
          outputText += part.text;
        }
      }
    }

    let finalText = outputText.trim() || "Desk monitoring flows.";

    finalText = removeLinks(finalText);

    userMemory[userId].push({
      role: "assistant",
      content: finalText
    });

    return finalText;

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return "Desk system error. Retry.";
  }
}

/* =====================================================
   MARKET DATA
===================================================== */
async function getQuote(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });
    return res.data;
  } catch {
    return null;
  }
}

async function getCrypto(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/crypto/quote?symbol=BINANCE:${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });
    return res.data;
  } catch {
    return null;
  }
}

/* =====================================================
   PRICE VALIDATION (กันราคาหลุดโลก)
===================================================== */
function validatePrice(symbol, price) {
  if (!price) return false;

  if (symbol.includes("XAU") && (price < 1000 || price > 4000))
    return false;

  if (symbol.includes("USDT") && price > 1000000)
    return false;

  return true;
}

/* =====================================================
   FLEX BUILDER
===================================================== */
function buildFlex(symbol, data) {
  const price = data.c ?? 0;
  const change = data.d ?? 0;
  const pct = data.dp ?? 0;
  const up = change >= 0;

  return {
    type: "flex",
    altText: `${symbol} ${price}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: symbol, weight: "bold", size: "xl" },
          {
            type: "text",
            text: `${price}`,
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
   LINE REPLY
===================================================== */
async function reply(replyToken, messages) {
  try {
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
  } catch (err) {
    console.error("LINE Error:", err.response?.data || err.message);
  }
}

/* =====================================================
   SEARCH DETECTOR
===================================================== */
function shouldUseSearch(text) {
  const keywords = [
    "ข่าว",
    "ล่าสุด",
    "ตอนนี้",
    "fed",
    "cpi",
    "ดอกเบี้ย",
    "ปฏิทิน"
  ];
  return keywords.some(k =>
    text.toLowerCase().includes(k)
  );
}

/* =====================================================
   WEBHOOK
===================================================== */
app.post("/webhook", async (req, res) => {

  try {

    const event = req.body.events?.[0];
    if (!event || event.type !== "message")
      return res.sendStatus(200);

    const raw = event.message.text?.trim();
    if (!raw) return res.sendStatus(200);

    const text = raw.toUpperCase();
    const userId = event.source.userId;

    console.log("USER:", raw);

    /* ===== GOLD ===== */
    if (text === "XAUUSD" || text.includes("ทอง")) {
      const gold = await getQuote("OANDA:XAU_USD");
      if (gold?.c && validatePrice("XAUUSD", gold.c)) {
        await reply(event.replyToken, [buildFlex("XAUUSD", gold)]);
        return res.sendStatus(200);
      }
    }

    /* ===== CRYPTO ===== */
    if (/^[A-Z]{3,10}USDT$/.test(text)) {
      const crypto = await getCrypto(text);
      if (crypto?.c && validatePrice(text, crypto.c)) {
        await reply(event.replyToken, [buildFlex(text, crypto)]);
        return res.sendStatus(200);
      }
    }

    /* ===== STOCK ===== */
    if (/^[A-Z]{1,6}$/.test(text)) {
      const stock = await getQuote(text);
      if (stock?.c) {
        await reply(event.replyToken, [buildFlex(text, stock)]);
        return res.sendStatus(200);
      }
    }

    /* ===== AI CHAT ===== */
    const useSearch = shouldUseSearch(raw);
    const aiText = await askAI(userId, raw, useSearch);

    await reply(event.replyToken, [
      { type: "text", text: aiText }
    ]);

    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook Error:", err.message);
    res.sendStatus(500);
  }
});

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
  console.log("🏦 Institutional Clean Desk Mode Running on Port " + PORT);
});
