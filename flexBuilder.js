// flexBuilder.js

function formatNumber(num, digit = 2) {
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: digit,
    maximumFractionDigits: digit
  });
}

function buildFlex(data) {
  const {
    symbol,
    name,
    price,
    change,
    percent,
    market,
    currency,
    status
  } = data;

  const up = change >= 0;
  const color = up ? '#00B16A' : '#E74C3C';
  const arrow = up ? '▲' : '▼';

  return {
    type: 'flex',
    altText: `${symbol} Price Update`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [

          // ===== Header =====
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: symbol,
                weight: 'bold',
                size: 'xl',
                color: '#FFFFFF'
              },
              {
                type: 'text',
                text: name,
                size: 'sm',
                color: '#AAAAAA'
              }
            ]
          },

          {
            type: 'separator',
            margin: 'md'
          },

          // ===== Price =====
          {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: 'PRICE',
                size: 'xs',
                color: '#888888'
              },
              {
                type: 'text',
                text: `${formatNumber(price)} ${currency}`,
                size: 'xxl',
                weight: 'bold',
                color: '#FFFFFF'
              }
            ]
          },

          // ===== Change =====
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: `${arrow} ${formatNumber(Math.abs(change))}`,
                size: 'md',
                weight: 'bold',
                color
              },
              {
                type: 'text',
                text: `(${up ? '+' : '-'}${formatNumber(Math.abs(percent))}%)`,
                size: 'md',
                color
              }
            ]
          },

          {
            type: 'separator',
            margin: 'md'
          },

          // ===== Footer Info =====
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
                color: status === 'OPEN' ? '#00B16A' : '#E67E22'
              }
            ]
          }

        ]
      },
      styles: {
        body: {
          backgroundColor: '#0B0E11' // Bloomberg black
        }
      }
    }
  };
}

module.exports = buildFlex;
