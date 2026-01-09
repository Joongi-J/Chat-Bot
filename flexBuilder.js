function buildAssetFlex(data) {
  // trend / bias
  let trend = 'กลาง'; // default
  if (data.percent > 1) trend = 'ขาขึ้น 📈';
  else if (data.percent < -1) trend = 'ขาลง 📉';

  // สีสำหรับเปลี่ยนตาม trend
  const color =
    data.percent > 0.5
      ? '#0f9d58' // เขียว
      : data.percent < -0.5
      ? '#db4437' // แดง
      : '#f4b400'; // เหลือง

  return {
    type: 'flex',
    altText: `${data.name} - ${data.price} ${data.currency} (${data.percent.toFixed(
      2
    )}%)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${data.name} (${data.symbol})`,
            weight: 'bold',
            size: 'lg',
            color: '#ffffff'
          }
        ],
        backgroundColor: '#1e1e1e',
        paddingAll: '12px'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'ราคา', size: 'sm', color: '#aaaaaa' },
              {
                type: 'text',
                text: `${data.price} ${data.currency}`,
                size: 'sm',
                color: '#ffffff',
                margin: 'md',
                flex: 1
              }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'Change', size: 'sm', color: '#aaaaaa' },
              {
                type: 'text',
                text: `${data.change >= 0 ? '+' : ''}${data.change.toFixed(
                  2
                )} (${data.percent.toFixed(2)}%)`,
                size: 'sm',
                color,
                margin: 'md',
                flex: 1
              }
            ]
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: 'Trend/Bias', size: 'sm', color: '#aaaaaa' },
              {
                type: 'text',
                text: trend,
                size: 'sm',
                color: color,
                margin: 'md',
                flex: 1
              }
            ]
          }
        ]
      }
    }
  };
}

module.exports = { buildAssetFlex };
