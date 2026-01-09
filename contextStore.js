// contextStore.js

const contextMap = new Map();

/*
Context structure:
{
  symbol: 'BTCUSDT',
  intent: 'CRYPTO',
  updatedAt: timestamp
}
*/

function getContext(userId) {
  return contextMap.get(userId);
}

function setContext(userId, context) {
  contextMap.set(userId, {
    ...context,
    updatedAt: Date.now()
  });
}

function clearContext(userId) {
  contextMap.delete(userId);
}

function isContextExpired(ctx, ttl = 60 * 1000) { // 1 นาที
  if (!ctx) return true;
  return Date.now() - ctx.updatedAt > ttl;
}

module.exports = {
  getContext,
  setContext,
  clearContext,
  isContextExpired
};
