const store = {};

function getContext(userId) {
  return store[userId] || 'เริ่มคุย';
}

function setContext(userId, value) {
  store[userId] = value;
}

module.exports = { getContext, setContext };
