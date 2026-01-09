/* =====================================
   flexBuilder.js
   Bloomberg / Yahoo Finance Style
   ▲ ▼ Arrow + Color
===================================== */

function buildStockFlex({
  symbol,
  current,
  open,
  prevClose,
  marketStatus,
  lastUpdate
}) {
  const cur = Number(current);
  const pc = Number(prevClose);
  const op = Number(open);

  const change = cur - pc;
  const changePct = pc !== 0 ? ((change / pc) * 100) : 0;

  /* ===== Arrow & Color ===== */
  const up = change >= 0;
  const color = up ? '#00B16A' : '#E74C3C';   // Green / Red
  const arrow = up ? '▲' : '▼';

  const marketColor = marketStatus === 'OPEN'
    ? '#00B16A'
    : '#9CA3AF';

  const timeText = lastUpdate
    ? new Date(lastUpdate).toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })
    : '-';

  return {
    type: 'flex',
    altText: `${symbol} ${cur.toFixed(2)}`,
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

          {
            type: 'separator',
            margin: 'md'
          },

          /* ===== PRICE ===== */
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            contents: [
              {
                type: 'text',
                text: cur.toFixed(2),
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

          {
            type: 'separator',
            margin: 'lg'
          },

          /* ===== DETAILS ===== */
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              buildRow('Open', op),
              buildRow('Prev Close', pc)
            ]
          }
        ]
      }
    }
  };
}

/* ===============================
   Helper Row
================================ */
function buildRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#6B7280',
        flex: 1
      },
      {
        type: 'text',
        text: Number(value).toFixed(2),
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
