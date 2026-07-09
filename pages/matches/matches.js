const storage = require('../../utils/storage.js')

Page({
  data: {
    matches: [],
    groups: [],
    filteredMatches: [],
    showFilterModal: false,
    filterGroupId: ''
  },

  onLoad: function () {
    this.loadData()
  },

  onShow: function () {
    this.loadData()
  },

  loadData: function () {
    const matches = storage.get('matches') || []
    const groups = storage.get('groups') || []

    const filteredMatches = matches.map(match => {
      const groupA = groups.find(g => g.id === match.groupAId)
      const groupB = groups.find(g => g.id === match.groupBId)
      return {
        ...match,
        groupAName: groupA?.name || '未知',
        groupBName: groupB?.name || '未知',
        groupAColor: groupA?.color || '#999',
        groupBColor: groupB?.color || '#999',
        winner: match.groupAScore > match.groupBScore ? 'A' : match.groupBScore > match.groupAScore ? 'B' : 'D'
      }
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    this.setData({ matches, groups, filteredMatches })
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

  deleteMatch: function (e) {
    const matchId = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '提示',
      content: '确定删除这场比赛吗？相关记录也会被删除',
      success: (res) => {
        if (res.confirm) {
          let matches = storage.get('matches') || []
          let records = storage.get('records') || []
          
          matches = matches.filter(m => m.id !== matchId)
          records = records.filter(r => r.matchId !== matchId)
          
          storage.set('matches', matches)
          storage.set('records', records)
          this.loadData()
          wx.showToast({ title: '删除成功', icon: 'success' })
        }
      }
    })
  },

  openFilter: function () {
    this.setData({ showFilterModal: true })
  },

  closeFilter: function () {
    this.setData({ showFilterModal: false })
  },

  selectFilterGroup: function (e) {
    const groupId = e.currentTarget.dataset.id
    this.setData({ filterGroupId: groupId })
  },

  applyFilter: function () {
    const { matches, filterGroupId, groups } = this.data
    
    let filteredMatches = matches
    
    if (filterGroupId) {
      filteredMatches = matches.filter(m => m.groupAId === filterGroupId || m.groupBId === filterGroupId)
    }
    
    filteredMatches = filteredMatches.map(match => {
      const groupA = groups.find(g => g.id === match.groupAId)
      const groupB = groups.find(g => g.id === match.groupBId)
      return {
        ...match,
        groupAName: groupA?.name || '未知',
        groupBName: groupB?.name || '未知',
        groupAColor: groupA?.color || '#999',
        groupBColor: groupB?.color || '#999',
        winner: match.groupAScore > match.groupBScore ? 'A' : match.groupBScore > match.groupAScore ? 'B' : 'D'
      }
    })
    
    this.setData({ filteredMatches, showFilterModal: false })
  },

  resetFilter: function () {
    this.setData({ filterGroupId: '' })
    this.applyFilter()
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 比赛列表',
      path: '/pages/matches/matches',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
