const axios = require('axios');
const FINNHUB_KEY = process.env.FINNHUB_KEY;

async function getQuote(symbol) {
  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
    );
    return res.data;
  } catch {
    return null;
  }
}

async function getTopGainersUS() {
  return `📊 หุ้น US บวกแรงวันนี้ (ตัวอย่าง)
- NVDA
- AMD
- META
*ข้อมูลอ้างอิงภาพรวมตลาด ไม่ใช่คำแนะนำลงทุน`;
}

module.exports = { getQuote, getTopGainersUS };
