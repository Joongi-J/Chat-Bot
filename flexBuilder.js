function priceColor(change) {
  return change >= 0 ? '#00B16A' : '#E74C3C';
}

function priceArrow(change) {
  return change >= 0 ? '▲' : '▼';
}

function buildAssetFlex(data) {
  const {
    symbol,
    name,
    price,
    change,
    percent,
    currency,
    market
  } = data;

  const color = priceColor(change);
  const arrow = priceArrow(change);

  return {
    type: 'flex',
    altText: `${symbol} ราคา`,
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
            text: name,
            weight: 'bold',
            size: 'lg'
          },
          {
            type: 'text',
            text: symbol,
            size: 'sm',
            color: '#888888'
          },
          {
            type: 'text',
            text: `${price.toLocaleString()} ${currency}`,
            size: 'xxl',
            weight: 'bold'
          },
          {
            type: 'text',
            text: `${arrow} ${change.toFixed(2)} (${percent.toFixed(2)}%)`,
            size: 'md',
            weight: 'bold',
            color
          },
          {
            type: 'separator'
          },
          {
            type: 'text',
            text: `Market: ${market}`,
            size: 'sm',
            color: '#666666'
          }
        ]
      }
    }
  };
}

module.exports = {
  buildAssetFlex
};
