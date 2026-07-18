const storage = require('../../utils/storage.js')

Page({
  data: {
    myMatches: []
  },

  onLoad: async function () {
    await this.loadMyMatchesFast()
  },

  onShow: async function () {
    await this.loadMyMatchesFast()
  },

  async loadMyMatchesFast() {
    const user = await storage.get('user') || {}
    const allMatches = await storage.get('matches') || []
    const myMatches = allMatches
      .filter(m => m.creatorId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    
    this.setData({ myMatches })
    
    this.syncMatchesInBackground()
  },

  async syncMatchesInBackground() {
    try {
      const cloudMatches = await storage.syncMatches()
      if (cloudMatches && cloudMatches.length > 0) {
        const user = await storage.get('user') || {}
        const myMatches = cloudMatches
          .filter(m => m.creatorId === user.id)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        this.setData({ myMatches })
      }
    } catch (e) {
      console.log('Background sync completed')
    }
  },

  goToCreate: function () {
    wx.navigateTo({
      url: '/packageA/pages/create-match/create-match'
    })
  },

  goToMatch: function (e) {
    const matchId = e.currentTarget.dataset.id
    const match = this.data.myMatches.find(m => m.id === matchId)
    
    if (match && match.status === 'active') {
      wx.navigateTo({
        url: `/packageA/pages/match-record/match-record?id=${matchId}`
      })
    } else {
      wx.navigateTo({
        url: `/packageA/pages/match-detail/match-detail?id=${matchId}`
      })
    }
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 我的比赛',
      path: '/pages/my-matches/my-matches',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
