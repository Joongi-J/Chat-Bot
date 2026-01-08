// flexBuilder.js
function buildStockFlex(symbol, price, support, resistance) {
  return {
    type: 'flex',
    altText: `${symbol} ราคา ${price}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          { type: 'text', text: symbol, weight: 'bold', size: 'xl', color: '#1DB446' },
          { type: 'text', text: `ราคา ${price} USD`, size: 'lg', margin: 'md' },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              { type: 'text', text: `แนวรับ: ${support}`, size: 'sm', color: '#00AA00', flex: 1 },
              { type: 'text', text: `แนวต้าน: ${resistance}`, size: 'sm', color: '#FF0000', flex: 1 }
            ]
          },
          {
            type: 'button',
            style: 'primary',
            margin: 'md',
            action: {
              type: 'message',
              label: 'ดูบทวิเคราะห์',
              text: `วิเคราะห์ ${symbol}`
            }
          }
        ]
      }
    }
  };
}

module.exports = { buildStockFlex };
