const storage = require('../../utils/storage.js')
const { syncUserFromCloud } = require('../../utils/sync-helper.js')

const MATCH_PAGE_SIZE = 5

Page({
  data: {
    historyMatches: [],
    historyTrainings: [],
    activeTab: 'match',
    tabs: [
      { id: 'match', name: '比赛', icon: 'root-list' },
      { id: 'training', name: '队训', icon: 'usergroup' }
    ],
    user: {},
    // 比赛列表分页状态
    matchLoading: false,         // 首屏或加载更多进行中
    matchInitialLoading: false,   // 首屏加载（区分"加载中"与"真无数据"）
    matchHasMore: true            // 是否还有更多比赛可加载
  },

  _matchSkip: 0,
  _SYNC_INTERVAL: 30000,
  _lastSyncTime: 0,
  _refreshing: false,

  onLoad: async function () {
    await this.loadUser()
    this.setData({ matchInitialLoading: true, matchHasMore: true })
    this._matchSkip = 0
    await this.loadMatchPage(true)
  },

  onShow: async function () {
    await this.loadUser()
    // 返回页面时仅当比赛为空才补拉首屏，避免破坏已加载的分页状态
    if (this.data.historyMatches.length === 0 && !this.data.matchInitialLoading) {
      this._matchSkip = 0
      this.setData({ matchInitialLoading: true, matchHasMore: true })
      await this.loadMatchPage(true)
    }
    if (this.data.historyTrainings.length === 0) {
      await this.loadTrainings()
    }
  },

  async loadUser() {
    const user = await syncUserFromCloud()
    this.setData({ user })
  },

  // 加载比赛列表某一页；isFirst=true 时重置为第一页（最近 5 场）
  async loadMatchPage(isFirst) {
    if (this.data.matchLoading) return
    this.setData({ matchLoading: true })

    try {
      const skip = isFirst ? 0 : this._matchSkip
      const { list, hasMore } = await storage.getMatchesPaged('finished', skip, MATCH_PAGE_SIZE)

      if (isFirst) {
        this.setData({
          historyMatches: list,
          matchHasMore: hasMore,
          matchInitialLoading: false,
          matchLoading: false
        })
        this._matchSkip = list.length
      } else {
        // 去重兜底（理论上 skip 分页不会重复，防止边界重复渲染）
        const existIds = new Set(this.data.historyMatches.map(m => m.id))
        const append = list.filter(m => !existIds.has(m.id))
        this.setData({
          historyMatches: this.data.historyMatches.concat(append),
          matchHasMore: hasMore,
          matchLoading: false
        })
        this._matchSkip += list.length
      }
    } catch (e) {
      console.error('Load match page failed:', e)
      this.setData({ matchLoading: false, matchInitialLoading: false })
    }
  },

  // 触底（onReachBottom）或点击"加载更多"时触发下一页
  loadMoreMatches() {
    if (!this.data.matchHasMore || this.data.matchLoading) return
    this.loadMatchPage(false)
  },

  onReachBottom() {
    if (this.data.activeTab === 'match') {
      this.loadMoreMatches()
    }
  },

  async loadTrainings() {
    try {
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
    // 切换到队训且尚无数据时加载
    if (tab === 'training' && this.data.historyTrainings.length === 0) {
      this.loadTrainings()
    }
  },

  async onPullDownRefresh() {
    if (this._refreshing) {
      wx.stopPullDownRefresh()
      return
    }
    this._refreshing = true
    this._lastSyncTime = 0
    // 下拉刷新：比赛重置到第一页，队训全量刷新
    this._matchSkip = 0
    this.setData({ matchHasMore: true })
    await this.loadMatchPage(true)
    await this.loadTrainings()
    this._refreshing = false
    wx.stopPullDownRefresh()
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
