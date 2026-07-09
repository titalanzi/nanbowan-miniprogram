const storage = require('../../utils/storage.js')

Page({
  data: {
    groups: [],
    matches: [],
    members: [],
    records: [],
    recentMatches: [],
    stats: {
      totalMatches: 0,
      totalGroups: 0,
      totalMembers: 0,
      totalScores: 0
    }
  },

  onLoad: function () {
    this.loadData()
  },

  onShow: function () {
    this.loadData()
  },

  loadData: function () {
    const groups = storage.get('groups') || []
    const matches = storage.get('matches') || []
    const members = storage.get('members') || []
    const records = storage.get('records') || []

    const recentMatches = matches.slice(-5).reverse().map(match => {
      const groupA = groups.find(g => g.id === match.groupAId)
      const groupB = groups.find(g => g.id === match.groupBId)
      return {
        ...match,
        groupAName: groupA?.name || '未知',
        groupBName: groupB?.name || '未知',
        groupAColor: groupA?.color || '#999',
        groupBColor: groupB?.color || '#999'
      }
    })

    const totalScores = records.filter(r => r.type === 'score').reduce((sum, r) => sum + r.value, 0)

    this.setData({
      groups,
      matches,
      members,
      records,
      recentMatches,
      stats: {
        totalMatches: matches.length,
        totalGroups: groups.length,
        totalMembers: members.length,
        totalScores
      }
    })
  },

  goToCreateMatch: function () {
    wx.navigateTo({
      url: '/pages/matches/create'
    })
  },

  viewMatchDetail: function (e) {
    const matchId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/matches/detail?id=${matchId}`
    })
  },

  goToPage: function (e) {
    const page = e.currentTarget.dataset.page
    wx.switchTab({
      url: `/pages/${page}/${page}`
    })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 比赛计分系统',
      path: '/pages/active/active',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
