const storage = require('../../utils/storage.js')

Page({
  data: {
    activeMatches: [],
    bannerImage: '/images/banner.jpg',
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
        console.log('Using preloaded matches for active page')
        const activeMatches = app.globalData.preloadedMatches.filter(m => m.status === 'active')
        this.setData({ activeMatches })
        // 清空预拉取数据，避免重复使用
        app.globalData.preloadedMatches = null
        return
      }
      
      // 没有预拉取数据，正常请求
      console.log('Loading active matches from cloud...')
      const cloudMatches = await storage.getMatchesFromCloudOnly()
      console.log('Cloud matches count:', cloudMatches.length)
      
      const activeMatches = cloudMatches.filter(m => m.status === 'active')
      console.log('Active matches count:', activeMatches.length)
      activeMatches.forEach(m => console.log('Active match:', m.id, 'status:', m.status))
      
      this.setData({ activeMatches })
    } catch (e) {
      console.error('Background sync failed:', e)
    }
  },

  onPullDownRefresh: async function () {
    try {
      const cloudMatches = await storage.getMatchesFromCloudOnly()
      const activeMatches = cloudMatches.filter(m => m.status === 'active')
      this.setData({ activeMatches })
    } catch (e) {
      console.error('Refresh failed:', e)
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

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 活动列表',
      path: '/pages/active/active',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
