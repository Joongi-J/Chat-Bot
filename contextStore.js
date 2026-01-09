const contextMap = new Map();

/*
context structure:
{
  symbol: 'BTC',
  market: 'CRYPTO' | 'STOCK' | 'GOLD',
  updatedAt: timestamp
}
*/

function getContext(userId) {
  return contextMap.get(userId) || null;
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

function isContextExpired(ctx, ttl = 60 * 1000) {
  if (!ctx) return true;
  return Date.now() - ctx.updatedAt > ttl;
}

module.exports = {
  getContext,
  setContext,
  clearContext,
  isContextExpired
};
