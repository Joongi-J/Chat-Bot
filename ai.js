const axios = require('axios');
const OPENAI = process.env.OPENAI_API_KEY;

async function askAI(text, context) {
  const prompt = `
คุณคือคนที่คุยเรื่องหุ้นและคริปโตเก่ง
พูดเหมือนคนจริง ไม่ใช้ศัพท์เว่อร์

กติกา:
- ถามหุ้น / คริปโต / ลิสต์ → ตอบได้
- ถาม "ควรซื้อไหม" → อธิบายความน่าจะเป็น + สิ่งที่ต้องพิจารณา
- ไม่ฟันธง ไม่เชียร์
- ใช้คำว่า "ผม" และลงท้าย "ครับ"

บริบทก่อนหน้า:
${context}

ข้อความ:
${text}
`;

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return res.data.choices[0].message.content;
}

module.exports = { askAI };
