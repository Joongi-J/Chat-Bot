const axios = require('axios');
const FINNHUB = 'https://finnhub.io/api/v1';
const KEY = process.env.FINNHUB_API_KEY;

async function getQuote(symbol) {
  const { data } = await axios.get(`${FINNHUB}/quote`, {
    params: { symbol, token: KEY }
  });
  return data;
}

async function getTopGainersUS() {
  // Finnhub ไม่มี endpoint ตรง → ใช้ Nasdaq sample logic
  const symbols = ['NVDA', 'TSLA', 'META', 'AMD', 'AAPL'];
  const results = [];

  for (const s of symbols) {
    const q = await getQuote(s);
    const pct = (((q.c - q.pc) / q.pc) * 100).toFixed(2);
    results.push(`${s} +${pct}%`);
  }

  return results.sort((a, b) => parseFloat(b.split('+')[1]) - parseFloat(a.split('+')[1]));
}

async function getSectorRotation() {
  return `
เงินกำลังไหลเข้า:
- Tech
- Semiconductor

เงินไหลออก:
- Utility
- Consumer Defensive
`;
}

async function getCryptoHeatmap() {
  return [
    { symbol: 'BTC', change: 2.4 },
    { symbol: 'ETH', change: -1.1 },
    { symbol: 'SOL', change: 5.8 }
  ];
}

module.exports = {
  getQuote,
  getTopGainersUS,
  getSectorRotation,
  getCryptoHeatmap
};
