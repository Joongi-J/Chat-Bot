const axios = require('axios');
const OPENAI = process.env.OPENAI_API_KEY;

async function askSignalZeeker(text, context) {
  const prompt = `
คุณคือ Signal Zeeker
- วิเคราะห์เชิงเงินไหล / เกมตลาด
- ไม่ให้คำแนะนำการลงทุน
- ใช้คำว่า "ผม" ลงท้าย "ครับ"

Context ผู้ใช้ก่อนหน้า: ${context}

ข้อมูล:
${text}
`;

  const res = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
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

module.exports = { askSignalZeeker };
