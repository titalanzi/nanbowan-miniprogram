const storage = require('../../utils/storage.js')

Page({
  data: {
    match: null,
    groupA: null,
    groupB: null,
    records: [],
    groupARecords: [],
    groupBRecords: [],
    groupAStats: {},
    groupBStats: {}
  },

  onLoad: function (options) {
    const matchId = options.id
    this.loadData(matchId)
  },

  loadData: function (matchId) {
    const matches = storage.get('matches') || []
    const groups = storage.get('groups') || []
    const records = storage.get('records') || []

    const match = matches.find(m => m.id === matchId)
    
    if (!match) {
      wx.showToast({ title: '比赛不存在', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    const groupA = groups.find(g => g.id === match.groupAId)
    const groupB = groups.find(g => g.id === match.groupBId)

    const matchRecords = records.filter(r => r.matchId === matchId)
    const groupARecords = matchRecords.filter(r => r.team === 'A')
    const groupBRecords = matchRecords.filter(r => r.team === 'B')

    const groupAStats = this.calculateStats(groupARecords)
    const groupBStats = this.calculateStats(groupBRecords)

    this.setData({
      match,
      groupA,
      groupB,
      records: matchRecords,
      groupARecords,
      groupBRecords,
      groupAStats,
      groupBStats
    })
  },

  calculateStats: function (records) {
    const stats = {}
    records.forEach(r => {
      if (!stats[r.typeName]) {
        stats[r.typeName] = 0
      }
      stats[r.typeName] += r.value
    })
    return stats
  },

  goBack: function () {
    wx.navigateBack()
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '福保南波万飞盘 - 比赛详情',
      path: `/pages/matches/detail?id=${this.data.match?.id}`,
      imageUrl: app.globalData.shareAvatar
    }
  }
})
