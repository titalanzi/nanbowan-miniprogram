const storage = require('../../utils/storage.js')
const { syncUserFromCloud } = require('../../utils/sync-helper.js')

Page({
  data: {
    activeMatches: [],
    activeTrainings: [],       // 进行中的队训列表
    activities: [],             // 合并后的活动列表（比赛+队训）
    banners: [],               // 云存储 banner 临时 URL 数组
    bannerFallback: '', // 云加载失败时隐藏 banner
    currentSwiper: 0,          // 当前 swiper 索引
    user: {}
  },

  _lastSyncTime: 0,
  _SYNC_INTERVAL: 30000, // 30秒内不重复从云端拉取

  onLoad: async function () {
    await this.loadUser()
    await this.syncMatchesInBackground()
    this.loadBanners()
  },

  onShow: async function () {
    await this.loadUser()
    await this.syncMatchesInBackground()
  },

  // 从云存储 banners/ 目录加载 banner 图
  loadBanners: async function () {
    try {
      if (!wx.cloud || !wx.cloud.callFunction) {
        return
      }
      const res = await wx.cloud.callFunction({ name: 'getBanners' })
      if (res && res.result && res.result.success && res.result.data.length > 0) {
        this.setData({ banners: res.result.data })
        console.log('Banners loaded from cloud:', res.result.data.length)
      }
    } catch (e) {
      console.log('Load banners failed, using fallback:', e)
    }
  },

  // swiper 切换事件
  onSwiperChange: function (e) {
    this.setData({ currentSwiper: e.detail.current })
  },

  async loadUser() {
    const user = await syncUserFromCloud()
    this.setData({ user })
  },

  async syncMatchesInBackground() {
    try {
      // 优先使用预拉取的数据（保留数据不清理，其他页面也可复用）
      const app = getApp()
      let activeMatches = []
      if (app.globalData.preloadedMatches) {
        activeMatches = app.globalData.preloadedMatches.filter(m => m.status === 'active')
        this.setData({ activeMatches })
        app.globalData.preloadedTime = Date.now()
      } else {
        const now = Date.now()
        if (now - this._lastSyncTime < this._SYNC_INTERVAL) {
          const localMatches = storage.get('matches') || []
          activeMatches = localMatches.filter(m => m.status === 'active')
          this.setData({ activeMatches })
          await this.loadTrainings()
          return
        }
        this._lastSyncTime = now

        console.log('Loading active matches from cloud...')
        const cloudMatches = await storage.getMatchesFromCloudOnly()
        if (!cloudMatches || cloudMatches.length === 0) {
          console.log('Cloud fetch empty, trying local storage...')
          const localMatches = storage.get('matches') || []
          activeMatches = localMatches.filter(m => m.status === 'active')
        } else {
          activeMatches = cloudMatches.filter(m => m.status === 'active')
        }
        this.setData({ activeMatches })
      }

      // 并行加载进行中的队训
      await this.loadTrainings()
    } catch (e) {
      console.error('Background sync failed:', e)
      try {
        const localMatches = storage.get('matches') || []
        const activeMatches = localMatches.filter(m => m.status === 'active')
        this.setData({ activeMatches })
      } catch (e2) {
        console.error('Local fallback also failed:', e2)
      }
    }
  },

  async loadTrainings() {
    try {
      const trainings = await storage.getTrainingsFromCloud('active')
      this.setData({ activeTrainings: trainings })
    } catch (e) {
      console.error('Load trainings failed:', e)
      this.setData({ activeTrainings: [] })
    }
  },

  onPullDownRefresh: async function () {
    try {
      this._lastSyncTime = 0 // 下拉刷新不受节流限制
      const cloudMatches = await storage.getMatchesFromCloudOnly()
      let activeMatches = cloudMatches.filter(m => m.status === 'active')

      if (activeMatches.length === 0) {
        const localMatches = storage.get('matches') || []
        activeMatches = localMatches.filter(m => m.status === 'active')
      }

      this.setData({ activeMatches })
      await this.loadTrainings()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (e) {
      console.error('Refresh failed:', e)
      try {
        const localMatches = storage.get('matches') || []
        const activeMatches = localMatches.filter(m => m.status === 'active')
        this.setData({ activeMatches })
      } catch (e2) {
        wx.showToast({ title: '刷新失败', icon: 'none' })
      }
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  goToMatch: function (e) {
    const matchId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageA/pages/match-record/match-record?id=${matchId}`
    })
  },

  goToTraining: function (e) {
    const trainingId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageB/pages/training-detail/training-detail?id=${trainingId}`
    })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 活动列表',
      path: '/pages/active/active',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
