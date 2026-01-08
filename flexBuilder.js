// flexBuilder.js
function EMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

function buildStockFlex(symbol, quote, candles) {
  const closes = candles.c;
  const highs = candles.h.slice(-30);
  const lows = candles.l.slice(-30);

  const resistance = Math.max(...highs).toFixed(2);
  const support = Math.min(...lows).toFixed(2);

  const ema50 = EMA(closes.slice(-50), 50);
  const ema200 = EMA(closes.slice(-200), 200);

  return {
    type: 'flex',
    altText: `${symbol} ราคา ${quote.c}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: symbol, weight: 'bold', size: 'xl' },
          { type: 'text', text: `ราคา ${quote.c} USD`, size: 'lg' },

          { type: 'separator' },

          { type: 'text', text: `📈 แนวต้าน: ${resistance}` },
          { type: 'text', text: `📉 แนวรับ: ${support}` },

          { type: 'separator' },

          { type: 'text', text: `EMA50: ${ema50}` },
          { type: 'text', text: `EMA200: ${ema200}` },

          {
            type: 'button',
            style: 'primary',
            action: {
              type: 'message',
              label: 'ดูบทวิเคราะห์',
              text: `วิเคราะห์ ${symbol}`
            }
          }
        ]
      }
    }
  };
}

module.exports = { buildStockFlex };
