// flexBuilder.js
function buildStockFlex(symbol, priceData, support = '-', resistance = '-') {
  const {
    current,
    prevClose
  } = priceData;

  const change = current - prevClose;
  const changePct = ((change / prevClose) * 100).toFixed(2);

  const isUp = change >= 0;
  const arrow = isUp ? '▲' : '▼';
  const color = isUp ? '#1DB446' : '#D93025';

  return {
    type: 'flex',
    altText: `${symbol} ${current} USD`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          /* SYMBOL */
          {
            type: 'text',
            text: symbol,
            weight: 'bold',
            size: 'xl',
            color: '#111111'
          },

          /* PRICE */
          {
            type: 'text',
            text: `${current.toFixed(2)} USD`,
            size: 'xxl',
            weight: 'bold',
            color
          },

          /* CHANGE */
          {
            type: 'text',
            text: `${arrow} ${change.toFixed(2)} (${changePct}%)`,
            size: 'md',
            color
          },

          /* DIVIDER */
          {
            type: 'separator',
            margin: 'md'
          },

          /* SUPPORT / RESISTANCE */
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            margin: 'md',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: 'แนวรับ', size: 'xs', color: '#888888' },
                  { type: 'text', text: support, size: 'sm', weight: 'bold', color: '#1DB446' }
                ],
                flex: 1
              },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: 'แนวต้าน', size: 'xs', color: '#888888' },
                  { type: 'text', text: resistance, size: 'sm', weight: 'bold', color: '#D93025' }
                ],
                flex: 1
              }
            ]
          },

          /* BUTTON */
          {
            type: 'button',
            style: 'primary',
            margin: 'lg',
            color: '#111111',
            action: {
              type: 'message',
              label: '📊 ดูบทวิเคราะห์',
              text: `วิเคราะห์ ${symbol}`
            }
          }
        ]
      }
    }
  };
}

module.exports = { buildStockFlex };
