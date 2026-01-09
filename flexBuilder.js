function buildStockFlex(symbol, current, open, prevClose, marketStatus) {
  const c = Number(current);
  const pc = Number(prevClose);
  const change = c - pc;
  const pct = ((change / pc) * 100).toFixed(2);

  const up = change >= 0;
  const color = up ? '#00B16A' : '#E74C3C';
  const arrow = up ? '▲' : '▼';

  return {
    type: 'flex',
    altText: `${symbol} ${c.toFixed(2)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          /* HEADER */
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: symbol, weight: 'bold', size: 'xl' },
              {
                type: 'text',
                text: marketStatus === 'OPEN' ? 'Market Open' : 'Market Closed',
                size: 'sm',
                color: marketStatus === 'OPEN' ? '#00B16A' : '#999999',
                align: 'end'
              }
            ]
          },

          /* PRICE */
          {
            type: 'text',
            text: c.toFixed(2),
            size: '4xl',
            weight: 'bold',
            color
          },

          /* CHANGE */
          {
            type: 'text',
            text: `${arrow} ${change.toFixed(2)} (${pct}%)`,
            size: 'md',
            color
          },

          { type: 'separator' },

          /* METRICS */
          metricRow('Open (Session)', open ? open.toFixed(2) : '—'),
          metricRow('Prev Close', pc.toFixed(2))
        ]
      }
    }
  };
}

function metricRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: '#666666'
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

module.exports = { buildStockFlex };
