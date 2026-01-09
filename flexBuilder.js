function buildStockFlex(symbol, current, open, prevClose) {
  const currentPrice = Number(current);
  const openPrice = Number(open);
  const prevClosePrice = Number(prevClose);

  const change = currentPrice - prevClosePrice;
  const changePct = ((change / prevClosePrice) * 100).toFixed(2);

  const isUp = change >= 0;
  const color = isUp ? '#00B16A' : '#E74C3C';
  const arrow = isUp ? '▲' : '▼';

  return {
    type: 'flex',
    altText: `${symbol} ราคา ${currentPrice}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          /* ===== HEADER ===== */
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: symbol,
                weight: 'bold',
                size: 'xl',
                flex: 0
              },
              {
                type: 'text',
                text: 'Market Price',
                size: 'sm',
                color: '#888888',
                align: 'end'
              }
            ]
          },

          /* ===== PRICE ===== */
          {
            type: 'text',
            text: currentPrice.toFixed(2),
            size: '4xl',
            weight: 'bold',
            color
          },

          /* ===== CHANGE ===== */
          {
            type: 'text',
            text: `${arrow} ${change.toFixed(2)} (${changePct}%)`,
            size: 'md',
            color
          },

          {
            type: 'separator'
          },

          /* ===== METRICS ===== */
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              metricRow('Open', openPrice.toFixed(2)),
              metricRow('Prev Close', prevClosePrice.toFixed(2))
            ]
          },

          {
            type: 'separator'
          },

          /* ===== FOOTER ===== */
          {
            type: 'text',
            text: 'Realtime price via Finnhub',
            size: 'xs',
            color: '#AAAAAA',
            align: 'center'
          }
        ]
      }
    }
  };
}

/* ===============================
   Helper: Metric Row
================================ */
function metricRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#666666',
        flex: 0
      },
      {
        type: 'text',
        text: value,
        size: 'sm',
        align: 'end'
      }
    ]
  };
}

module.exports = {
  buildStockFlex
};
