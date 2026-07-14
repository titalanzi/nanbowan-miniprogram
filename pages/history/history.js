const storage = require('../../utils/storage.js')

Page({
  data: {
    historyMatches: [],
    user: {}
  },

  onLoad: async function () {
    await this.syncUserFromCloud()
    await this.syncMatchesInBackground()
  },

  onShow: async function () {
    await this.syncUserFromCloud()
    await this.syncMatchesInBackground()
  },

  async syncUserFromCloud() {
    const user = await storage.get('user') || {}
    if (!user.id) {
      this.setData({ user })
      return
    }
    
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        const result = await wx.cloud.callFunction({
          name: 'getUserFromCloud'
        })
        
        if (result && result.result && result.result.success && result.result.data) {
          const cloudUser = result.result.data
          const mergedUser = {
            ...user,
            name: cloudUser.name || user.name,
            avatar: cloudUser.avatar || user.avatar,
            role: cloudUser.role || user.role,
            registered: true
          }
          
          if (JSON.stringify(mergedUser) !== JSON.stringify(user)) {
            storage.setLocal('user', mergedUser)
            this.setData({ user: mergedUser })
          }
        }
      }
    } catch (e) {
      console.log('Sync user from cloud failed:', e)
      this.setData({ user })
    }
  },

  async syncMatchesInBackground() {
    try {
      // 优先使用预拉取的数据
      const app = getApp()
      if (app.globalData.preloadedMatches) {
        console.log('Using preloaded matches for history page')
        const historyMatches = app.globalData.preloadedMatches.filter(m => 
          m.status === 'finished' && m.status !== 'deleted'
        ).sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        )
        this.setData({ historyMatches })
        // 清空预拉取数据，避免重复使用
        app.globalData.preloadedMatches = null
        return
      }
      
      // 没有预拉取数据，正常请求
      console.log('Loading history matches from cloud...')
      const cloudMatches = await storage.getMatchesFromCloudOnly()
      console.log('Cloud matches count:', cloudMatches.length)
      
      const historyMatches = cloudMatches.filter(m => m.status === 'finished' && m.status !== 'deleted').sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      )
      console.log('History matches count:', historyMatches.length)
      historyMatches.forEach(m => console.log('History match:', m.id, 'status:', m.status))
      
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
