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
   DESK SYSTEM PROMPT
===================================================== */
const SYSTEM_PROMPT = `
คุณคือ Senior Trader ใน Hedge Fund

ตอบเหมือน internal trading desk
กระชับ มี conviction
ไม่ใช้หัวข้อ
ไม่ทำเป็นบทความ
ไม่ใส่ลิงก์
ถ้าไม่ชัดให้บอกว่ายังไม่ชัด
`;

/* =====================================================
   UTIL
===================================================== */
function removeLinks(text) {
  return text.replace(/https?:\/\/\S+/g, "").trim();
}

function validatePrice(symbol, price) {
  if (!price || typeof price !== "number") return false;

  if (symbol.includes("XAU") && (price < 1000 || price > 4000))
    return false;

  if (symbol.includes("USDT") && (price < 0.0001 || price > 1000000))
    return false;

  if (price <= 0) return false;

  return true;
}

/* =====================================================
   OPENAI CALL
===================================================== */
async function askAI(userId, text, marketContext = "") {
  try {
    if (!userMemory[userId]) userMemory[userId] = [];

    userMemory[userId].push({ role: "user", content: text });
    if (userMemory[userId].length > MAX_MEMORY)
      userMemory[userId].shift();

    const input = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (marketContext) {
      input.push({
        role: "system",
        content: "Market snapshot: " + marketContext
      });
    }

    input.push(...userMemory[userId]);

    const res = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1",
        input
      },
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
        if (part.type === "output_text")
          outputText += part.text;
      }
    }

    let finalText = removeLinks(outputText.trim() || "Monitoring flows.");

    userMemory[userId].push({
      role: "assistant",
      content: finalText
    });

    return finalText;

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return "Desk system latency. Retry.";
  }
}

/* =====================================================
   MARKET DATA LAYER
===================================================== */

// Yahoo Gold Futures (Primary)
async function getGoldYahoo() {
  try {
    const url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=GC=F";
    const res = await axios.get(url, { timeout: 10000 });
    const r = res.data.quoteResponse.result[0];

    return {
      c: r.regularMarketPrice,
      d: r.regularMarketChange,
      dp: r.regularMarketChangePercent
    };
  } catch {
    return null;
  }
}

// Finnhub Generic
async function getQuote(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url, { timeout: 10000 });
    return res.data;
  } catch {
    return null;
  }
}

// Crypto
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
            text: price.toString(),
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

    /* ===== GOLD ENGINE ===== */
    if (text === "XAUUSD" || text.includes("ทอง")) {

      let gold = await getGoldYahoo();

      if (!gold || !validatePrice("XAUUSD", gold.c)) {
        gold = await getQuote("OANDA:XAU_USD");
      }

      if (gold && validatePrice("XAUUSD", gold.c)) {
        await reply(event.replyToken, [buildFlex("XAUUSD", gold)]);
      } else {
        await reply(event.replyToken, [
          { type: "text", text: "Gold feed unstable. Liquidity check ongoing." }
        ]);
      }

      return res.sendStatus(200);
    }

    /* ===== CRYPTO ===== */
    if (/^[A-Z]{3,10}USDT$/.test(text)) {
      const crypto = await getCrypto(text);
      if (crypto && validatePrice(text, crypto.c)) {
        await reply(event.replyToken, [buildFlex(text, crypto)]);
        return res.sendStatus(200);
      }
    }

    /* ===== STOCK ===== */
    if (/^[A-Z]{1,6}$/.test(text)) {
      const stock = await getQuote(text);
      if (stock && validatePrice(text, stock.c)) {
        await reply(event.replyToken, [buildFlex(text, stock)]);
        return res.sendStatus(200);
      }
    }

    /* ===== AI MODE WITH MARKET CONTEXT ===== */
    let context = "";

    const gold = await getGoldYahoo();
    if (gold && validatePrice("XAUUSD", gold.c)) {
      context += `XAUUSD ${gold.c} (${gold.dp}%) `;
    }

    const aiText = await askAI(userId, raw, context);

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
  console.log("Prime Broker Desk Running on Port " + PORT);
});
