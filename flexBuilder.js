function baseFlex(data) {
  const {
    symbol,
    name,
    price,
    change,
    percent,
    currency,
    market,
    status
  } = data;

  const up = change >= 0;
  const color = up ? '#00B16A' : '#E74C3C';
  const arrow = up ? '▲' : '▼';

  return {
    type: 'flex',
    altText: `${symbol} Price`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: symbol,
            size: 'xl',
            weight: 'bold',
            color: '#FFFFFF'
          },
          {
            type: 'text',
            text: name,
            size: 'sm',
            color: '#AAAAAA'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: `${price.toLocaleString()} ${currency}`,
            size: 'xxl',
            weight: 'bold',
            color: '#FFFFFF'
          },
          {
            type: 'text',
            text: `${arrow} ${Math.abs(change).toLocaleString()} (${up ? '+' : '-'}${Math.abs(percent)}%)`,
            size: 'md',
            color
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: market,
                size: 'xs',
                color: '#AAAAAA'
              },
              {
                type: 'text',
                text: status,
                size: 'xs',
                align: 'end',
                color: '#F1C40F'
              }
            ]
          }
        ]
      },
      styles: {
        body: {
          backgroundColor: '#0B0E11'
        }
      }
    }
  };
}

module.exports = {
  buildStockFlex: baseFlex,
  buildCryptoFlex: baseFlex,
  buildGoldFlex: baseFlex
};
