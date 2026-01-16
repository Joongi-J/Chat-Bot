require('dotenv').config();
const express = require('express');
const axios = require('axios');

const { getTopGainersUS, getSectorRotation, getCryptoHeatmap, getQuote } = require('./marketService');
const { askSignalZeeker } = require('./aiService');
const { getContext, setContext } = require('./contextStore');
const { buildStockFlex, buildHeatmapFlex } = require('./flexBuilder');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const LINE_TOKEN = process.env.LINE_TOKEN;

/* ===============================
   LINE Reply
================================ */
async function reply(replyToken, messages) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

/* ===============================
   WEBHOOK
================================ */
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body.events?.[0];
    if (!event || event.type !== 'message') return res.sendStatus(200);

    const text = event.message.text.trim();
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    const context = getContext(userId);

    /* ===== US TOP GAINER ===== */
    if (/บวกแรง|top gainer/i.test(text)) {
      const gainers = await getTopGainersUS();
      const ai = await askSignalZeeker(
        `หุ้น US บวกแรงวันนี้:\n${gainers.join('\n')}`,
        context
      );
      setContext(userId, 'US_TOP_GAINER');
      await reply(replyToken, [{ type: 'text', text: ai }]);
      return res.sendStatus(200);
    }

    /* ===== SECTOR ROTATION ===== */
    if (/sector|เงินไหล/i.test(text)) {
      const sector = await getSectorRotation();
      const ai = await askSignalZeeker(
        `ข้อมูล Sector Rotation:\n${sector}`,
        context
      );
      setContext(userId, 'SECTOR');
      await reply(replyToken, [{ type: 'text', text: ai }]);
      return res.sendStatus(200);
    }

    /* ===== CRYPTO HEATMAP ===== */
    if (/crypto|คริปโต|heatmap/i.test(text)) {
      const heatmap = await getCryptoHeatmap();
      const flex = buildHeatmapFlex(heatmap);
      setContext(userId, 'CRYPTO');
      await reply(replyToken, [flex]);
      return res.sendStatus(200);
    }

    /* ===== SYMBOL ===== */
    if (/^[A-Z]{1,6}$/.test(text)) {
      const quote = await getQuote(text);
      const flex = buildStockFlex(text, quote);
      setContext(userId, 'SYMBOL');
      await reply(replyToken, [flex]);
      return res.sendStatus(200);
    }

    /* ===== AI CHAT (SMART) ===== */
    const ai = await askSignalZeeker(text, context);
    await reply(replyToken, [{ type: 'text', text: ai }]);
    res.sendStatus(200);

  } catch (err) {
    console.error(err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log('🚀 Signal Zeeker GOD MODE running');
});
