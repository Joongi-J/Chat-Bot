const axios = require('axios');
const FINNHUB = 'https://finnhub.io/api/v1';
const KEY = process.env.FINNHUB_API_KEY;

async function getQuote(symbol) {
  try {
    const { data } = await axios.get(`${FINNHUB}/quote`, {
      params: { symbol, token: KEY }
    });
    return data;
  } catch {
    return null;
  }
}

async function getTopMovers() {
  const symbols = ['BTCUSDT', 'NVDA', 'TSLA', 'ETHUSDT', 'COIN'];
  const result = [];

  for (const s of symbols) {
    const q = await getQuote(s);
    if (!q || !q.pc) continue;
    const pct = (((q.c - q.pc) / q.pc) * 100).toFixed(2);
    result.push(`${s} ${pct > 0 ? '+' : ''}${pct}%`);
  }

  return result.sort((a, b) => parseFloat(b.split('%')[0]) - parseFloat(a.split('%')[0]));
}

async function searchAssets(text) {
  if (/ai/i.test(text)) return ['NVDA', 'AMD', 'MSFT', 'GOOGL'];
  if (/crypto|คริปโต/i.test(text)) return ['BTC', 'ETH', 'SOL', 'AVAX'];
  if (/พลังงาน/i.test(text)) return ['XOM', 'CVX', 'OXY'];
  return ['AAPL', 'TSLA', 'META'];
}

module.exports = { getQuote, getTopMovers, searchAssets };
