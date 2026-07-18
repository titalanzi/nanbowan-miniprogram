const storage = require('../../utils/storage.js')
const { syncUserFromCloud } = require('../../utils/sync-helper.js')

Page({
  data: {
    historyMatches: [],
    historyTrainings: [],
    activeTab: 'match',
    tabs: [
      { id: 'match', name: '比赛', icon: '🥏' },
      { id: 'training', name: '队训', icon: '🏃' }
    ],
    user: {}
  },

  _lastSyncTime: 0,
  _SYNC_INTERVAL: 30000,

  onLoad: async function () {
    await this.loadUser()
    await this.syncDataInBackground()
  },

  onShow: async function () {
    await this.loadUser()
    await this.syncDataInBackground()
  },

  async loadUser() {
    const user = await syncUserFromCloud()
    this.setData({ user })
  },

  async syncDataInBackground() {
    try {
      // 比赛数据优先使用预拉取缓存
      const app = getApp()
      let historyMatches = []

      if (app.globalData.preloadedMatches) {
        historyMatches = app.globalData.preloadedMatches
          .filter(m => m.status === 'finished')
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        app.globalData.preloadedTime = Date.now()
      } else {
        const now = Date.now()
        if (now - this._lastSyncTime < this._SYNC_INTERVAL) {
          const localMatches = storage.get('matches') || []
          historyMatches = localMatches
            .filter(m => m.status === 'finished')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          this.setData({ historyMatches })
          // 队训数据也尝试本地
          await this.loadTrainings()
          return
        }
        this._lastSyncTime = now

        console.log('Loading history matches from cloud...')
        const cloudMatches = await storage.getMatchesFromCloudOnly()
        historyMatches = cloudMatches
          .filter(m => m.status === 'finished')
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }

      this.setData({ historyMatches })

      // 并行加载队训数据
      await this.loadTrainings()
    } catch (e) {
      console.error('Background sync failed:', e)
    }
  },

  async loadTrainings() {
    try {
      console.log('Loading finished trainings from cloud...')
      const trainings = await storage.getTrainingsFromCloud('finished')
      const historyTrainings = trainings
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      this.setData({ historyTrainings })
    } catch (e) {
      console.error('Load trainings failed:', e)
      this.setData({ historyTrainings: [] })
    }
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab
    if (this.data.activeTab === tab) return
    this.setData({ activeTab: tab })
    wx.vibrateShort({ type: 'light' })
  },

  goToDetail: function (e) {
    const id = e.currentTarget.dataset.id
    if (this.data.activeTab === 'match') {
      wx.navigateTo({
        url: `/packageA/pages/match-detail/match-detail?id=${id}`
      })
    } else {
      wx.navigateTo({
        url: `/packageB/pages/training-detail/training-detail?id=${id}`
      })
    }
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
