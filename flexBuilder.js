function buildPriceFlex(symbol, q) {
  const change = q.d || 0;
  const changePct = q.dp || 0;

  const isUp = change > 0;
  const arrow = isUp ? '▲' : change < 0 ? '▼' : '•';
  const color = isUp ? '#16A34A' : change < 0 ? '#DC2626' : '#6B7280';

  return {
    type: 'flex',
    altText: `${symbol} ${arrow} ${q.c}`,
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
                flex: 1
              },
              {
                type: 'text',
                text: arrow,
                size: 'xl',
                color,
                align: 'end'
              }
            ]
          },

          /* ===== PRICE ===== */
          {
            type: 'text',
            text: `$${q.c.toFixed(2)}`,
            size: 'xxl',
            weight: 'bold',
            color
          },
          {
            type: 'text',
            text: `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct.toFixed(2)}%)`,
            size: 'md',
            color
          },

          /* ===== DIVIDER ===== */
          {
            type: 'separator',
            margin: 'md'
          },

          /* ===== STATS ===== */
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            contents: [
              stat('High', q.h),
              stat('Low', q.l)
            ]
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'md',
            contents: [
              stat('Open', q.o),
              stat('Prev', q.pc)
            ]
          },

          /* ===== FOOTER ===== */
          {
            type: 'text',
            text: 'Realtime market data • Signal Zeeker',
            size: 'xs',
            color: '#9CA3AF',
            align: 'center',
            margin: 'md'
          }
        ]
      }
    }
  };
}

function stat(label, value) {
  return {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: label,
        size: 'xs',
        color: '#6B7280'
      },
      {
        type: 'text',
        text: `$${value.toFixed(2)}`,
        size: 'sm',
        weight: 'bold'
      }
    ]
  };
}

module.exports = { buildPriceFlex };
