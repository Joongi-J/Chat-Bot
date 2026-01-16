function buildPriceFlex(symbol, q) {
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
            text: `${up ? '▲' : '▼'} ${q.c}`,
            size: 'lg',
            color: up ? '#00C853' : '#D50000'
          }
        ]
      }
    }
  };
}

module.exports = { buildPriceFlex };
