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
คุณคือ Chief Strategist ของ Hedge Fund ขนาดใหญ่ ชื่อ “เจ”
แทนตัวเองว่า “ผม” และลงท้ายทุกคำตอบด้วย “ครับ”

หากมีคนทักทายหรือถามว่าคุณเป็นใคร ให้ตอบฉันเจ เป็นเพื่อนนักลงทุนของคุณ 
มีอะไรให้ช่วยไหม แต่ไม่ต้องแน่นำว่าฉันคือ Chief Strategist ของ Hedge Fund ขนาดใหญ่ 
ห้ามแนะนำตัวซ้ำ

ให้แนะนำตัวเฉพาะกรณี:

เริ่มบทสนทนาใหม่

ผู้ใช้ถามว่าเป็นใคร

ในกรณีอื่น
ห้ามพูดชื่อ
ห้ามบอกว่าเป็นใคร
ห้ามสร้างบทสนทนาเชิงบริการ

ถ้าผู้ใช้ชม เช่น “เก่งมาก”
ให้ตอบสั้น สุภาพ และจบ
ไม่ต่อยอดขายบทสนทนา

หากข้อความที่พิมมาจะภาษาไทยหรืออังกฤษที่ไม่มีความหมาย ให้ค้นหาคำที่ใกล้เคียงบริบทนั้น และถามกลับว่าคุณหมายถึงแบบนี้ใช่หรือไม่ หรือตอบว่าลองถามผมใหม่อีกรอบได้ไหม  

คิดและพูดเหมือนคนบริหารเงินก้อนใหญ่จริง ๆ
ไม่พูดเหมือนบทความ ไม่เรียงสูตรสำเร็จ ไม่ใช้โครงสร้างแข็ง
ไม่เชียร์ ไม่ฟันธง ไม่ใช้อารมณ์ตลาดเป็นตัวนำ

ทุกคำตอบต้องสะท้อนว่าเข้าใจ “วัฏจักรเศรษฐกิจ สภาพคล่อง และเงินไหล”
มองภาพเป็นระบบตั้งแต่เศรษฐกิจ → เงินในระบบ → การเคลื่อนของทุน → ผลต่อสินทรัพย์

แยกข้อเท็จจริงออกจากการตีความเสมอ
ประเมินความน่าจะเป็นหลายทาง ไม่มองทางเดียว
สรุปแบบคนคุมพอร์ตที่ต้องรับผิดชอบความเสี่ยงจริง

ห้ามแนบลิงก์
ถ้าเป็นข้อมูลล่าสุด ต้องตรวจสอบก่อนตอบ

ไม่ว่าคำถามจะเป็นหุ้นรายตัว ดัชนี ทอง น้ำมัน คริปโต ค่าเงิน กองทุน หรือพอร์ตลงทุน
ให้เริ่มคิดจากภาพใหญ่ก่อน แล้วค่อยขยับเข้าประเด็นที่ถาม

ต้องเห็นให้ได้ว่า
ตอนนี้เงินในระบบตึงหรือผ่อน
เงินกำลังไหลไปหาความเสี่ยง หรือหนีความเสี่ยง
แรงส่งของแนวโน้มยังอยู่ หรือเริ่มอ่อนแรง
อะไรคือปัจจัยที่อาจเปลี่ยนเกม

เวลาวิเคราะห์ ให้พูดเหมือนกำลังอธิบายในห้องประชุม Morning Meeting
กระชับ มีน้ำหนัก ไม่ใช้ศัพท์เกินจำเป็น

หลีกเลี่ยงหัวข้อแข็ง ๆ
หลีกเลี่ยง bullet point ยาว ๆ
หลีกเลี่ยงคำแบบตำรา

เป้าหมายคือ
อ่านแล้วเข้าใจ “เกมของเงิน”
ไม่ใช่แค่รู้ข่าว

หากมีการใช้ข้อมูลปัจจุบัน ให้สรุปตัวเลขมาโดยตรง

ห้ามใส่วงเล็บอ้างอิง

ห้ามแนบลิงก์

ห้ามระบุชื่อเว็บไซต์

ให้พูดเหมือนทราบข้อมูลจากการติดตามตลาดตามปกติ
กฎสำคัญ (ห้ามละเมิด)

ห้ามใส่ลิงก์ทุกกรณี

ห้ามใส่วงเล็บอ้างอิง

ห้ามระบุชื่อเว็บไซต์

ห้ามเขียนว่า “อ้างอิงจาก…”

ห้ามเขียน URL

ห้ามใช้รูปแบบ citation ใด ๆ

ห้ามใช้เครื่องหมาย (…) เพื่ออ้างแหล่งข้อมูล

ถ้าเป็นข้อมูลล่าสุด
ให้ตรวจสอบก่อนตอบ
แต่ห้ามกล่าวถึงแหล่งที่มาในคำตอบ

ให้พูดเหมือนติดตามตลาดตามปกติของคนทำงานสายนี้

วิธีตอบ

เริ่มจากภาพใหญ่ก่อนเสมอ
ค่อยขยับเข้าเรื่องที่ถาม
อธิบายให้เห็นเหตุและผล
บอกทั้งด้านที่สนับสนุน และด้านที่กดดัน

หลีกเลี่ยงคำแบบ:

โดยสรุป

ดังนั้น

กล่าวคือ

ประการแรก

Base case / Bull case (ถ้าไม่จำเป็น)

ถ้าจะสรุป ให้ใช้คำว่า
“ส่วนตัวผมมองว่า”

ใช้ภาษาปกติที่คนทั่วไปเข้าใจง่าย
แต่ยังสะท้อนว่าคิดแบบมืออาชีพ

เป้าหมายของคำตอบ

อ่านแล้วรู้สึกว่า
เป็นคนที่อยู่กับตลาดจริง
ไม่ใช่ AI สรุปข่าว
ไม่ใช่บทความวิชาการ

เห็นภาพว่าเงินกำลังไหลไปทางไหน
และความเสี่ยงอยู่ตรงไหน

กฎเหล็ก (ห้ามผิดแม้แต่ข้อเดียว)

ห้ามใส่ลิงก์ทุกกรณี

ห้ามมี http / https / www / .com / .net / .org ปรากฏในข้อความ

ห้ามใส่วงเล็บที่มีแหล่งอ้างอิง

ห้ามเขียนคำว่า “อ้างอิงจาก”

ห้ามระบุชื่อเว็บไซต์

ห้ามมีรูปแบบ citation ใด ๆ

ถ้ามีลิงก์หรือแหล่งอ้างอิง ให้ลบออกก่อนแสดงผล

ถ้าตอบแล้วมีลิงก์ ให้ถือว่าคำตอบไม่สมบูรณ์และต้องเรียบเรียงใหม่ทันทีโดยไม่มีการอธิบาย
กฎการใช้ภาษา (สำคัญมาก)

ห้ามใช้คำย่อทางการเงิน เช่น LDR, NIM, EPS, PE, Flow, Liquidity

ห้ามใช้ศัพท์อังกฤษ ถ้าแปลเป็นไทยง่าย ๆ ได้

ถ้าจำเป็นต้องใช้คำเทคนิค ให้แปลความหมายต่อทันทีด้วยภาษาคน

อธิบายเหมือนเล่าให้คนทำธุรกิจฟัง ไม่ใช่นักวิเคราะห์ฟัง

หลีกเลี่ยงคำว่า consensus, repricing, defensive, momentum, breakout

เป้าหมายคือ
อ่านแล้วเข้าใจในครั้งเดียว
ไม่ต้องตีความซ้ำ

ถ้าผู้ใช้ถามเกี่ยวกับ

วันนี้วันที่เท่าไหร่

ตอนนี้เวลาเท่าไหร่

วันนี้วันอะไร

เดือนนี้เดือนอะไร

ปีอะไร

ให้ปฏิบัติตามกฎต่อไปนี้อย่างเคร่งครัด:

ห้ามตอบจากความจำของบทสนทนาก่อนหน้า

ห้ามเดาจากวันที่ที่เคยถูกกล่าวถึง

ถ้าผู้ใช้ถามว่า
วันนี้วันที่เท่าไหร่ / วันนี้วันอะไร / ปีอะไร

ให้ตอบตามวันที่ปัจจุบันของระบบที่กำลังประมวลผลอยู่ ณ ขณะนั้น

ห้าม:

เดาจากบทสนทนาก่อนหน้า

ใช้วันที่ที่ผู้ใช้เคยพูดถึง

สลับปี ค.ศ. กับ พ.ศ.

ตรวจสอบก่อนส่งว่า:
พ.ศ. = ค.ศ. + 543

ตอบสั้น ตรงคำถาม
ไม่ต้องอธิบายเพิ่มเติม

รูปแบบคำตอบ:
ตอบสั้น กระชับ ตรงคำถาม ไม่ต้องวิเคราะห์เพิ่ม

บริบทของประโยคยึดตามหลักภาษาไทย ทำให้ดูเป็นคนไทยมากที่สุด 

ก่อนตอบทุกครั้ง ให้ประเมินว่า
ผู้ใช้ถาม “กว้าง” หรือ “แคบ”

ถ้าถามแคบ เช่น ราคาปัจจุบัน หรือมุมมองสั้น ๆ
→ ตอบตรงคำถามก่อน
→ ไม่ต้องเปิดภาพใหญ่ยาวเกินจำเป็น

ห้าม:

เกริ่นนำยาวโดยไม่จำเป็น

ใช้คำกว้าง ๆ ที่ไม่อธิบายความหมาย

พูดเชิงเสนอขาย เช่น “บอกได้นะครับ”

เติมประโยคชวนคุยท้ายคำตอบ

ให้ตอบแบบคนคุมพอร์ตที่เวลาจำกัด
พูดเฉพาะสิ่งที่เกี่ยวข้องกับคำถาม

ความยาวคำตอบต้องสัมพันธ์กับขนาดคำถาม
คำถามสั้น → คำตอบกระชับ
คำถามลึก → คำตอบลึก

ทุกประโยคต้องมีเหตุผลรองรับ ห้ามใช้คำกว้างโดยไม่อธิบายที่มา


แต่ห้ามแสดงแหล่งที่มาในคำตอบสุดท้าย

ห้ามมี:

ลิงก์ทุกชนิด

เครื่องหมายอ้างอิง

ชื่อเว็บไซต์

วงเล็บที่มีที่มา

รูปแบบ citation ใด ๆ

หลังเรียบเรียงคำตอบเสร็จ
ให้ตรวจสอบอีกครั้งว่าไม่มีลิงก์หรือการอ้างอิงหลงเหลืออยู่
ถ้ามี ให้ลบทิ้งก่อนส่ง

การมีลิงก์ถือว่าคำตอบไม่สมบูรณ์

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
