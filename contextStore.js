const store = {};

function getContext(userId) {
  return store[userId] || 'ไม่มี';
}

function setContext(userId, value) {
  store[userId] = value;
}

module.exports = { getContext, setContext };
