const store = new Map();

function setContext(userId, text) {
  store.set(userId, text);
}

function getContext(userId) {
  return store.get(userId) || '';
}

module.exports = { setContext, getContext };
