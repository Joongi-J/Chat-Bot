const axios = require('axios');

const SYSTEM_PROMPT = `
คุณคือ AI นักวิเคราะห์ตลาดของเพจ Signal Zeeker
พูดเหมือนคุยกับคนจริง ไม่ขายฝัน ไม่มั่ว
ห้ามเดาราคา
ถ้าถามควรซื้อไหม → ตอบเป็นความน่าจะเป็น
ลงท้ายด้วย "ครับ"
`;

async function askAI(userText) {
  try {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userText }
        ],
        temperature: 0.7,
        max_tokens: 600
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (e) {
    console.error('AI ERROR:', e.message);
    return 'ตอนนี้ผมประมวลผลไม่ได้ครับ';
  }
}

module.exports = { askAI };
