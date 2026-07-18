const storage = require('../../utils/storage.js')
const { syncUserFromCloud } = require('../../utils/sync-helper.js')

Page({
  data: {
    historyMatches: [],
    user: {}
  },

  _lastSyncTime: 0,
  _SYNC_INTERVAL: 30000, // 30秒内不重复从云端拉取

  onLoad: async function () {
    await this.loadUser()
    await this.syncMatchesInBackground()
  },

  onShow: async function () {
    await this.loadUser()
    await this.syncMatchesInBackground()
  },

  async loadUser() {
    const user = await syncUserFromCloud()
    this.setData({ user })
  },

  async syncMatchesInBackground() {
    try {
      // 优先使用预拉取的数据（保留数据不清理，其他页面也可复用）
      const app = getApp()
      if (app.globalData.preloadedMatches) {
        const historyMatches = app.globalData.preloadedMatches
          .filter(m => m.status === 'finished')
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        this.setData({ historyMatches })
        app.globalData.preloadedTime = Date.now()
        return
      }

      // 节流
      const now = Date.now()
      if (now - this._lastSyncTime < this._SYNC_INTERVAL) {
        const localMatches = storage.get('matches') || []
        const historyMatches = localMatches
          .filter(m => m.status === 'finished')
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        this.setData({ historyMatches })
        return
      }
      this._lastSyncTime = now

      console.log('Loading history matches from cloud...')
      const cloudMatches = await storage.getMatchesFromCloudOnly()

      const historyMatches = cloudMatches
        .filter(m => m.status === 'finished')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      this.setData({ historyMatches })
    } catch (e) {
      console.error('Background sync failed:', e)
    }
  },

  goToDetail: function (e) {
    const matchId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageA/pages/match-detail/match-detail?id=${matchId}`
    })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 赛程记录',
      path: '/pages/history/history',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
