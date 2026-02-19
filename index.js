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

/* =====================================================
   INSTITUTIONAL ELITE SYSTEM PROMPT
===================================================== */
const SYSTEM_PROMPT = `
คุณคือ Chief Strategist จาก Hedge Fund

สไตล์:
- วิเคราะห์แบบ Institutional
- ไม่ขายของ
- ไม่เว่อร์
- สุขุม มั่นใจ มีตรรกะ
- ลงท้ายด้วยคำว่าครับ 
- ตอบให้ดูโปร คำพูดเข้าใจง่าย 
- ห้ามแนบลิ้ง 

โครงสร้างการตอบ:


ภาพรวมสั้น ๆ


Trend / Liquidity / Momentum


เงินไหล / ดอกเบี้ย / Dollar / Risk Sentiment


ความเสี่ยงหลัก


Scenario A / Scenario B


มุมมองเชิงกลยุทธ์แบบเป็นกลาง

ถ้าเป็นข้อมูลล่าสุด:
ต้องใช้ web_search
`;

/* =====================================================
   OPENAI CALL
===================================================== */
async function askAI(userId, text, useSearch=false) {
  try {

    if (!userMemory[userId]) {
      userMemory[userId] = [];
    }

    userMemory[userId].push({ role: "user", content: text });

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
        }
      }
    );

    let outputText = "";

    res.data.output?.forEach(o => {
      o.content?.forEach(c => {
        if (c.type === "output_text") {
          outputText += c.text;
        }
      });
    });

    const finalText = outputText.trim() || "Desk evaluating data...";

    userMemory[userId].push({
      role: "assistant",
      content: finalText
    });

    return finalText;

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return "Institutional Desk system error.";
  }
}

/* =====================================================
   MARKET DATA
===================================================== */
async function getStock(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
}

async function getCrypto(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/crypto/quote?symbol=BINANCE:${symbol}&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
}

async function getGold() {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=OANDA:XAU_USD&token=${FINNHUB_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
}

/* =====================================================
   RISK REWARD CALCULATOR
===================================================== */
function calculateRR(entry, stop, target) {
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target - entry);
  const rr = reward / risk;
  return rr.toFixed(2);
}

/* =====================================================
   POSITION SIZE CALCULATOR
===================================================== */
function calculatePositionSize(accountSize, riskPercent, entry, stop) {
  const riskAmount = accountSize * (riskPercent / 100);
  const riskPerUnit = Math.abs(entry - stop);
  const positionSize = riskAmount / riskPerUnit;
  return positionSize.toFixed(2);
}

/* =====================================================
   FLEX BUILDER
===================================================== */
function buildFlex(symbol, priceData) {
  const change = priceData.d || 0;
  const pct = priceData.dp || 0;
  const up = change >= 0;

  return {
    type: "flex",
    altText: `${symbol} ${priceData.c}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: symbol, weight: "bold", size: "xl" },
          {
            type: "text",
            text: `${priceData.c}`,
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
   SEARCH DETECTOR
===================================================== */
function shouldUseSearch(text) {
  const keywords = [
    "ข่าว",
    "ล่าสุด",
    "ตอนนี้",
    "ปฏิทิน",
    "cpi",
    "fed",
    "ดอกเบี้ย",
    "ทอง"
  ];
  return keywords.some(k => text.toLowerCase().includes(k));
}

/* =====================================================
   WEBHOOK
===================================================== */
app.post("/webhook", async (req, res) => {

  const event = req.body.events?.[0];
  if (!event || event.type !== "message") {
    return res.sendStatus(200);
  }

  const raw = event.message.text.trim();
  const text = raw.toUpperCase();
  const userId = event.source.userId;

  console.log("USER:", raw);

  /* ===== GOLD ===== */
  if (text.includes("XAU") || text.includes("ทอง")) {
    const gold = await getGold();
    if (gold?.c) {
      await reply(event.replyToken, [buildFlex("XAUUSD", gold)]);
      return res.sendStatus(200);
    }
  }

  /* ===== CRYPTO ===== */
  if (/^[A-Z]{3,10}USDT$/.test(text)) {
    const crypto = await getCrypto(text);
    if (crypto?.c) {
      await reply(event.replyToken, [buildFlex(text, crypto)]);
      return res.sendStatus(200);
    }
  }

  /* ===== STOCK ===== */
  if (/^[A-Z]{1,6}$/.test(text)) {
    const stock = await getStock(text);
    if (stock?.c) {
      await reply(event.replyToken, [buildFlex(text, stock)]);
      return res.sendStatus(200);
    }
  }

  /* ===== RISK REWARD COMMAND ===== */
  if (text.startsWith("RR ")) {
    const parts = raw.split(" ");
    const entry = parseFloat(parts[1]);
    const stop = parseFloat(parts[2]);
    const target = parseFloat(parts[3]);

    const rr = calculateRR(entry, stop, target);

    await reply(event.replyToken, [
      { type: "text", text: `Risk/Reward Ratio = 1:${rr}` }
    ]);

    return res.sendStatus(200);
  }

  /* ===== POSITION SIZE ===== */
  if (text.startsWith("SIZE ")) {
    const parts = raw.split(" ");
    const account = parseFloat(parts[1]);
    const riskPercent = parseFloat(parts[2]);
    const entry = parseFloat(parts[3]);
    const stop = parseFloat(parts[4]);

    const size = calculatePositionSize(account, riskPercent, entry, stop);

    await reply(event.replyToken, [
      { type: "text", text: `Position Size ≈ ${size} units` }
    ]);

    return res.sendStatus(200);
  }

  /* ===== AI ANALYSIS ===== */
  const useSearch = shouldUseSearch(raw);
  const aiText = await askAI(userId, raw, useSearch);

  await reply(event.replyToken, [
    { type: "text", text: aiText }
  ]);

  res.sendStatus(200);
});

/* =====================================================
   START SERVER
===================================================== */
app.listen(PORT, () => {
  console.log("🏦 Institutional Elite Mode Running on Port " + PORT);
});
