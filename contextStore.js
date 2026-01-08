// contextStore.js
const contextMap = new Map();

/*
context structure:
{
  symbol: 'TSLA',
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

// ถ้าเกิน 1 นาที ถือว่าเป็นคำถามใหม่
function isContextExpired(ctx, ttl = 1 * 60 * 1000) {
  if (!ctx) return true;
  return Date.now() - ctx.updatedAt > ttl;
}

module.exports = {
  getContext,
  setContext,
  clearContext,
  isContextExpired
};
