const axios = require('axios');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function askAI(message, context = '') {
  const prompt = `
คุณคือ Signal Zeeker
- คุยเหมือนคนจริง
- ตอบเรื่องหุ้น คริปโต ได้
- ไม่แนะนำลงทุนตรง ๆ
- ถ้าถามควรซื้อ ให้ตอบเชิงความน่าจะเป็น

Context:
${context}

คำถาม:
${message}
`;

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    }
  );

  return res.data.choices[0].message.content;
}

module.exports = { askAI };
