/* =====================================
   flexBuilder.js
   Bloomberg Style (SAFE VERSION)
===================================== */

function safeText(v, fallback = '-') {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
}

function num(v, fallback = 0) {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function buildStockFlex(data = {}) {
  const symbol = safeText(data.symbol, 'N/A');
  const current = num(data.current);
  const open = num(data.open);
  const prevClose = num(data.prevClose);

  const marketStatus = safeText(data.marketStatus, 'CLOSED');
  const lastUpdate = data.lastUpdate;

  const change = current - prevClose;
  const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  const up = change >= 0;
  const color = up ? '#00B16A' : '#E74C3C';
  const arrow = up ? '▲' : '▼';

  const marketColor =
    marketStatus === 'OPEN' ? '#00B16A' : '#9CA3AF';

  const timeText = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '-';

  return {
    type: 'flex',
    altText: `${symbol} ${current.toFixed(2)}`,
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
                color: '#111827',
                flex: 1
              },
              {
                type: 'text',
                text: marketStatus,
                size: 'sm',
                weight: 'bold',
                color: marketColor,
                align: 'end'
              }
            ]
          },

          {
            type: 'text',
            text: `Updated ${timeText}`,
            size: 'xs',
            color: '#6B7280'
          },

          { type: 'separator', margin: 'md' },

          /* ===== PRICE ===== */
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              {
                type: 'text',
                text: current.toFixed(2),
                size: 'xxl',
                weight: 'bold',
                color: '#111827'
              },
              {
                type: 'text',
                text: `${arrow} ${Math.abs(change).toFixed(2)} (${Math.abs(changePct).toFixed(2)}%)`,
                size: 'md',
                weight: 'bold',
                color
              }
            ]
          },

          { type: 'separator', margin: 'lg' },

          /* ===== DETAILS ===== */
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              buildRow('Open', open),
              buildRow('Prev Close', prevClose)
            ]
          }
        ]
      }
    }
  };
}

function buildRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: safeText(label),
        size: 'sm',
        color: '#6B7280',
        flex: 1
      },
      {
        type: 'text',
        text: num(value).toFixed(2),
        size: 'sm',
        weight: 'bold',
        color: '#111827',
        align: 'end'
      }
    ]
  };
}

module.exports = {
  buildStockFlex
};
