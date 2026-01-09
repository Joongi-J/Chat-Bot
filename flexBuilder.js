// flexBuilder.js
function buildStockFlex(symbol, price, support, resistance, ema50, ema200) {
  const ema50Pct = Math.min(Math.max((ema50 / price) * 100, 5), 95);
  const ema200Pct = Math.min(Math.max((ema200 / price) * 100, 5), 95);

  return {
    type: 'flex',
    altText: `${symbol} Stock Analysis`,
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
            weight: 'bold',
            size: 'xl'
          },
          {
            type: 'text',
            text: `ราคา ${price}`,
            size: 'lg',
            color: '#111111'
          },
          {
            type: 'separator'
          },
          {
            type: 'text',
            text: 'EMA Structure',
            weight: 'bold',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'EMA50', size: 'sm', flex: 2 },
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 5,
                    contents: [
                      {
                        type: 'box',
                        layout: 'vertical',
                        width: `${ema50Pct}%`,
                        height: '8px',
                        backgroundColor: '#4CAF50'
                      }
                    ]
                  }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'sm',
                contents: [
                  { type: 'text', text: 'EMA200', size: 'sm', flex: 2 },
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 5,
                    contents: [
                      {
                        type: 'box',
                        layout: 'vertical',
                        width: `${ema200Pct}%`,
                        height: '8px',
                        backgroundColor: '#FF9800'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'text',
            text: `โซนแนวรับ ${support} | โซนแนวต้าน ${resistance}`,
            wrap: true,
            size: 'sm',
            color: '#555555'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: 'ดูบทวิเคราะห์ต่อ',
              text: 'วิเคราะห์ต่อ'
            },
            style: 'primary'
          }
        ]
      }
    }
  };
}

module.exports = { buildStockFlex };
