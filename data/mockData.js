const storage = require('../utils/storage.js')

const mockMatches = []

async function initData() {
  // 只初始化比赛数据，不要初始化用户数据
  const matches = await storage.get('matches')
  if (!matches || matches.length === 0) {
    await storage.set('matches', mockMatches)
  }
}

module.exports = {
  initData
}