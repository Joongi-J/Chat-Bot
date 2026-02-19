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
   MEMORY + DESK STATE
===================================================== */
const userMemory = {};
const deskState = {};
const MAX_MEMORY = 20;

/* =====================================================
   SYSTEM PROMPT – PRIME BROKER DESK MODE
===================================================== */
const SYSTEM_PROMPT = `
You are a Senior Portfolio Manager at a Prime Brokerage Macro Desk.

Respond like internal trading floor chat.
No headings.
No bullet points.
No links.
No article formatting.
No explaining basics.
No motivational tone.

Tone:
Calm.
Direct.
Conviction when clear.
Say "not clear yet" if uncertain.

Use desk context provided.
If real-time macro is needed, use web_search.
Keep it concise.
`;

/* =====================================================
   OPENAI ENGINE
===================================================== */
async function askAI(userId, text, context, useSearch = false) {
  try {
    if (!userMemory[userId]) userMemory[userId] = [];

    userMemory[userId].push({ role: "user", content: text });
    if (userMemory[userId].length > MAX_MEMORY)
      userMemory[userId].shift();

    const body = {
      model: "gpt-4.1",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: `DeskContext:${JSON.stringify(context)}` },
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

    let output = "";

    for (const item of res.data.output || []) {
      for (const part of item.content || []) {
        if (part.type === "output_text") {
          output += part.text;
        }
      }
    }

    const finalText =
      output.trim() || "Flow muted. No edge yet.";

    userMemory[userId].push({
      role: "assistant",
      content: finalText
    });

    return finalText;

  } catch (err) {
    console.error("OpenAI Error:", err.response?.data || err.message);
    return "Desk latency spike. Retry.";
  }
}

/* =====================================================
   MARKET DATA LAYER
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
   CORE MACRO SNAPSHOT ENGINE
===================================================== */

async function buildMacroSnapshot() {

  const gold = await getQuote("OANDA:XAU_USD");
  const spy = await getQuote("SPY");
  const vix = await getQuote("^VIX");
  const dxy = await getQuote("DXY");
  const us10y = await getQuote("US10Y"); // proxy symbol

  return {
    gold: gold?.c || null,
    spy: spy?.c || null,
    vix: vix?.c || null,
    dollar: dxy?.c || null,
    yield10y: us10y?.c || null
  };
}

/* =====================================================
   REGIME DETECTION
===================================================== */

function detectRegime(snapshot) {
  if (!snapshot.vix || !snapshot.spy || !snapshot.dollar)
    return "Unknown";

  if (snapshot.vix > 22 && snapshot.spy <  snapshot.spy * 1.0)
    return "Risk-Off";

  if (snapshot.vix < 18)
    return "Risk-On";

  return "Transition";
}

/* =====================================================
   VOLATILITY HEATMAP
===================================================== */

function volatilityState(vix) {
  if (!vix) return "Unknown";
  if (vix > 28) return "Stress";
  if (vix > 20) return "Elevated";
  if (vix < 14) return "Compressed";
  return "Normal";
}

/* =====================================================
   DOLLAR PRESSURE LOGIC
===================================================== */

function dollarPressure(dollar, yield10y) {
  if (!dollar || !yield10y) return "Neutral";

  if (dollar > 0 && yield10y > 0)
    return "Tightening Pressure";

  if (dollar < 0 && yield10y < 0)
    return "Liquidity Expansion";

  return "Mixed";
}

/* =====================================================
   SEARCH DETECTOR
===================================================== */

function shouldUseSearch(text) {
  const keywords = [
    "fed",
    "cpi",
    "inflation",
    "fomc",
    "ข่าว",
    "ล่าสุด",
    "ดอกเบี้ย"
  ];

  return keywords.some(k =>
    text.toLowerCase().includes(k)
  );
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

  try {

    const event = req.body.events?.[0];
    if (!event || event.type !== "message")
      return res.sendStatus(200);

    const raw = event.message.text?.trim();
    if (!raw) return res.sendStatus(200);

    const userId = event.source.userId;

    if (!deskState[userId])
      deskState[userId] = { bias: "Neutral" };

    const snapshot = await buildMacroSnapshot();

    const regime = detectRegime(snapshot);
    const volState = volatilityState(snapshot.vix);
    const liquidity = dollarPressure(
      snapshot.dollar,
      snapshot.yield10y
    );

    const context = {
      regime,
      volatility: volState,
      liquidity,
      gold: snapshot.gold,
      spy: snapshot.spy
    };

    const useSearch = shouldUseSearch(raw);

    const aiText = await askAI(
      userId,
      raw,
      context,
      useSearch
    );

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
  console.log("🏦 Prime Broker Mode Running on Port " + PORT);
});
