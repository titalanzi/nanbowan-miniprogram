const storage = require('../../utils/storage.js')
const { syncUserFromCloud } = require('../../utils/sync-helper.js')

Page({
  data: {
    activeMatches: [],
    activeTrainings: [],       // 进行中的队训列表
    banners: [],               // 云存储 banner 临时 URL 数组
    bannerFallback: '',        // 云加载失败时隐藏 banner
    currentSwiper: 0,          // 当前 swiper 索引
    user: {},
    loading: true              // 首屏骨架屏：无缓存数据时显示
  },

  _lastSyncTime: 0,
  _SYNC_INTERVAL: 30000, // 30秒内不重复从云端拉取

  onLoad: function () {
    // 1) 先用启动预拉取缓存即时渲染（同步、不阻塞）
    this.renderFromCache()
    // 2) 下列均为后台并行，不再 await 阻塞列表
    this.loadUser()
    this.loadBanners()
    this.syncMatchesInBackground()
  },

  onShow: function () {
    // 切 tab 回来也先即时渲染缓存，保证不白屏
    this.renderFromCache()
    if (this.data.banners.length === 0) {
      this.loadBanners()
    }
    // 若比赛列表发生过变更（创建/结束），强制刷新，免去手动下拉
    const app = getApp()
    const force = !!(app.globalData && app.globalData.matchListDirty)
    this.syncMatchesInBackground(force)
    this.loadUser()
  },

  // 从 App 全局预拉取缓存即时出列表（首屏加速核心）
  renderFromCache() {
    const app = getApp()
    if (app.globalData && app.globalData.preloadedMatches) {
      const activeMatches = app.globalData.preloadedMatches.filter(m => m.status === 'active')
      this.setData({ activeMatches, loading: false })
    }
  },

  // swiper 切换事件
  onSwiperChange: function (e) {
    this.setData({ currentSwiper: e.detail.current })
  },

  // 用户态异步加载，不阻塞比赛列表
  loadUser() {
    syncUserFromCloud()
      .then((user) => {
        if (user) this.setData({ user })
      })
      .catch(() => {})
  },

  // 从云存储 banners/ 目录加载 banner 图（带本地缓存，缓存有效期7天）
  loadBanners: async function (forceRefresh = false) {
    try {
      if (!forceRefresh && storage.isBannersCacheValid()) {
        const cachedBanners = storage.getCachedBanners()
        this.setData({ banners: cachedBanners })
        console.log('Banners loaded from cache:', cachedBanners.length)
        return
      }

      if (!wx.cloud || !wx.cloud.callFunction) {
        const cachedBanners = storage.getCachedBanners()
        if (cachedBanners.length > 0) {
          this.setData({ banners: cachedBanners })
        }
        return
      }

      const res = await wx.cloud.callFunction({ name: 'getBanners' })
      if (res && res.result && res.result.success && res.result.data.length > 0) {
        this.setData({ banners: res.result.data })
        storage.setBannersCache(res.result.data)
      } else {
        const cachedBanners = storage.getCachedBanners()
        if (cachedBanners.length > 0) {
          this.setData({ banners: cachedBanners })
        }
      }
    } catch (e) {
      console.log('Load banners failed, using cached:', e)
      const cachedBanners = storage.getCachedBanners()
      if (cachedBanners.length > 0) {
        this.setData({ banners: cachedBanners })
      }
    }
  },

  // 后台刷新进行中的比赛 + 队训
  // force=true 时跳过节流，立即从云端拉取最新（用于「刚创建/结束比赛」回到首页的场景）
  syncMatchesInBackground: async function (force = false) {
    try {
      const app = getApp()
      const now = Date.now()
      // 是否需要重新拉取比赛：强制刷新 或 距上次同步已超过节流间隔
      const needMatchFetch = force || (now - this._lastSyncTime >= this._SYNC_INTERVAL)

      const tasks = []
      if (needMatchFetch) {
        tasks.push(
          storage.getMatchesFromCloudByStatus('active').then(cloudMatches => {
            this._lastSyncTime = now
            // 写回全局缓存，供下次即时渲染 + 其他页面复用
            if (app.globalData) {
              app.globalData.preloadedMatches = cloudMatches
              app.globalData.preloadedTime = now
            }
            this.setData({
              activeMatches: cloudMatches.filter(m => m.status === 'active'),
              loading: false
            })
          })
        )
      }
      // 队训与比赛并行拉取，互不阻塞，加快首屏
      tasks.push(this.loadTrainings())
      await Promise.all(tasks)
      this.setData({ loading: false })

      // 拉取成功，清除脏标记（避免下次无谓重复请求）
      if (app.globalData && app.globalData.matchListDirty) {
        app.globalData.matchListDirty = false
      }
    } catch (e) {
      console.error('Background sync failed:', e)
      // 即便失败也关闭骨架屏，露出空态或缓存内容
      this.setData({ loading: false })
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
      this._lastSyncTime = 0
      const activeMatches = await storage.getMatchesFromCloudByStatus('active')

      const app = getApp()
      if (app.globalData) {
        app.globalData.preloadedMatches = activeMatches
        app.globalData.preloadedTime = Date.now()
      }
      this.setData({ activeMatches, loading: false })
      await this.loadTrainings()
      await this.loadBanners(true)
      wx.showToast({ title: '刷新成功', icon: 'success' })
    } catch (e) {
      console.error('Refresh failed:', e)
      wx.showToast({ title: '刷新失败', icon: 'none' })
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

  createMatch: function () {
    const user = this.data.user
    if (!user || !user.id) {
      wx.showToast({ title: '请先注册', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/mine/mine' }), 1000)
      return
    }
    if (!user.avatar) {
      wx.showModal({
        title: '请完善头像',
        content: '创建比赛前需要先设置头像',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/mine/mine' })
          }
        }
      })
      return
    }
    wx.navigateTo({ url: '/packageA/pages/create-match/create-match' })
  },

  goTactics: function () {
    wx.navigateTo({ url: '/pages/tactics/list' })
  },

  goFrisbeeRules: function () {
    wx.navigateTo({ url: '/pages/frisbee-rules/frisbee-rules' })
  },

  goFrisbeeVocab: function () {
    wx.navigateTo({ url: '/pages/frisbee-vocab/frisbee-vocab' })
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
