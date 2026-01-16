function buildStockFlex(symbol, q) {
  const diff = q.c - q.pc;
  const up = diff >= 0;

  return {
    type: 'flex',
    altText: `${symbol} ${q.c}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: symbol, size: 'xl', weight: 'bold' },
          {
            type: 'text',
            text: `${up ? '▲' : '▼'} ${q.c} USD`,
            color: up ? '#00C853' : '#D50000',
            size: 'lg'
          }
        ]
      }
    }
  };
}

function buildHeatmapFlex(data) {
  return {
    type: 'flex',
    altText: 'Crypto Heatmap',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: data.map(c => ({
          type: 'text',
          text: `${c.symbol} ${c.change > 0 ? '▲' : '▼'} ${c.change}%`,
          color: c.change > 0 ? '#00C853' : '#D50000'
        }))
      }
    }
  };
}

module.exports = { buildStockFlex, buildHeatmapFlex };
