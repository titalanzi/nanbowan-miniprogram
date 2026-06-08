const storage = require('../../utils/storage.js')

Page({
  data: {
    matchId: '',
    match: {},
    activeTab: '',
    rankings: [],
    top3Colors: ['#F59E0B', '#9CA3AF', '#D97706'],
    canEdit: false,
    isCreator: false,
    isAssistant: false,
    groupStats: []
  },

  onLoad: async function (options) {
    if (options.id) {
      this.setData({ matchId: options.id })
    }
    await this.checkPermission()
    await this.loadMatchFast()
  },

  async checkPermission() {
    const user = await storage.get('user') || {}
    const isAssistant = user.role === 'assistant'
    const matchId = this.data.matchId
    
    console.log('=== match-detail checkPermission 调试 ===')
    console.log('当前用户:', user)
    console.log('用户ID:', user.id)
    console.log('用户角色:', user.role)
    console.log('比赛ID:', matchId)
    
    let isCreator = false
    let match = null
    
    if (matchId) {
      // 优先从云端获取比赛数据进行权限检查
      console.log('从云端获取比赛数据...')
      const cloudMatches = await storage.getMatchesFromCloudOnly()
      console.log('云端比赛数量:', cloudMatches.length)
      match = cloudMatches.find(m => m.id === matchId)
      console.log('云端找到的比赛:', match)
      
      // 如果云端没有，再从本地获取
      if (!match) {
        console.log('云端没有，从本地获取...')
        const matches = await storage.get('matches') || []
        match = matches.find(m => m.id === matchId)
        console.log('本地找到的比赛:', match)
      }
      
      if (match) {
        console.log('比赛创建者ID:', match.creatorId)
        console.log('用户ID vs 创建者ID:', user.id, '===', match.creatorId)
        if (match.creatorId === user.id) {
          isCreator = true
          console.log('✅ 用户是创建者')
        } else {
          console.log('❌ 用户不是创建者')
        }
      }
    }
    
    const canEdit = isCreator || isAssistant
    console.log('最终权限 - isCreator:', isCreator, 'isAssistant:', isAssistant, 'canEdit:', canEdit)
    console.log('=======================================')
    
    this.setData({ 
      isAssistant,
      isCreator,
      canEdit
    })
  },

  async loadMatchFast() {
    const matchId = this.data.matchId
    if (!matchId) return
    
    // 优先尝试从本地获取
    const matches = await storage.get('matches') || []
    let match = matches.find(m => m.id === matchId)
    
    // 如果本地没有，从云端获取
    if (!match) {
      console.log('Loading match from cloud...')
      const cloudMatches = await storage.getMatchesFromCloudOnly()
      match = cloudMatches.find(m => m.id === matchId)
    }
    
    if (match) {
      if (!match.records) match.records = []
      let activeTab = this.data.activeTab
      if (!activeTab && match.statTypes && match.statTypes.length > 0) {
        activeTab = match.statTypes[0].id
      }
      this.setData({ match, activeTab })
      this.calculateGroupStats()
      this.calculateRankings(activeTab)
    }
  },

  async syncMatchInBackground(matchId) {
    try {
      const cloudMatches = await storage.syncMatches()
      if (cloudMatches && cloudMatches.length > 0) {
        const cloudMatch = cloudMatches.find(m => m.id === matchId)
        if (cloudMatch) {
          const localMatch = this.data.match
          
          if (localMatch && localMatch.status === 'finished') {
            return
          }
          
          if (!localMatch || new Date(cloudMatch.updatedAt) > new Date(localMatch.updatedAt || 0)) {
            this.setData({ match: cloudMatch })
            this.calculateGroupStats()
          }
        }
      }
    } catch (e) {
      console.log('Background sync completed')
    }
  },

  calculateGroupStats: function () {
    const match = this.data.match
    if (!match || !match.groups || !match.records) {
      this.setData({ groupStats: [] })
      return
    }
    
    const stats = []
    for (let i = 0; i < match.groups.length; i++) {
      const group = match.groups[i]
      let score = 0
      let assist = 0
      let dDisc = 0
      for (let j = 0; j < match.records.length; j++) {
        const record = match.records[j]
        if (record.groupId === group.id) {
          if (record.statType === 'stat_score') score++
          else if (record.statType === 'stat_assist') assist++
          else if (record.statType === 'stat_d') dDisc++
        }
      }
      stats.push({
        groupId: group.id,
        groupName: group.name,
        color: group.color,
        score: score,
        assist: assist,
        dDisc: dDisc
      })
    }
    this.setData({ groupStats: stats })
  },

  getGroupScore: function (groupId) {
    const stats = this.data.groupStats
    for (let i = 0; i < stats.length; i++) {
      if (stats[i].groupId === groupId) {
        return stats[i].score
      }
    }
    return 0
  },

  getGroupStat: function (groupId, statType) {
    const stats = this.data.groupStats
    for (let i = 0; i < stats.length; i++) {
      if (stats[i].groupId === groupId) {
        if (statType === 'stat_assist') return stats[i].assist
        if (statType === 'stat_d') return stats[i].dDisc
        break
      }
    }
    return 0
  },

  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.calculateRankings(tab)
  },

  calculateRankings: function (statType) {
    const { match } = this.data
    if (!match.records || match.records.length === 0) {
      this.setData({ rankings: [] })
      return
    }

    const filteredRecords = match.records.filter(r => r.statType === statType)
    
    const stats = {}
    filteredRecords.forEach(record => {
      const key = record.memberId
      if (!stats[key]) {
        stats[key] = {
          memberId: record.memberId,
          memberName: record.memberName,
          groupId: record.groupId,
          groupName: record.groupName,
          groupColor: record.groupColor,
          count: 0
        }
      }
      stats[key].count++
    })

    const rankings = Object.values(stats).sort((a, b) => b.count - a.count)
    this.setData({ rankings })
  },

  async unfinishMatch() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可操作', icon: 'none' })
      return
    }
    
    const { match } = this.data
    
    wx.showModal({
      title: '取消结束比赛',
      content: '确定要重新开始这场比赛吗？',
      success: async (res) => {
        if (res.confirm) {
          const newMatch = { ...match, status: 'active', updatedAt: new Date().toISOString() }
          
          const matches = await storage.get('matches') || []
          const index = matches.findIndex(m => m.id === match.id)
          if (index !== -1) {
            matches[index] = newMatch
            await storage.set('matches', matches)
          }
          
          wx.showToast({
            title: '比赛已恢复',
            icon: 'success'
          })

          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/match-record/match-record?id=' + match.id
            })
          }, 1000)
        }
      }
    })
  },

  showDeleteConfirm: function() {
    if (!this.data.isAssistant) {
      wx.showToast({ title: '只有主理人助理可删除比赛', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '删除比赛',
      content: '确定要删除这场比赛吗？删除后无法恢复！',
      success: async (res) => {
        if (res.confirm) {
          await this.deleteMatch()
        }
      }
    })
  },

  async deleteMatch() {
    const { match, isAssistant } = this.data
    
    if (!isAssistant) {
      wx.showToast({ title: '只有主理人助理可删除比赛', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '删除中...' })
    
    try {
      const matches = await storage.get('matches') || []
      const newMatches = matches.map(m => {
        if (m.id === match.id) {
          return { ...m, status: 'deleted', updatedAt: new Date().toISOString() }
        }
        return m
      })
      
      // 先标记为已删除，防止被云端恢复
      storage.addDeletedMatchId(match.id)
      
      // 先更新云端数据为已删除状态
      try {
        if (wx.cloud && wx.cloud.callFunction) {
          await wx.cloud.callFunction({
            name: 'deleteMatch',
            data: { matchId: match.id }
          })
        }
      } catch (e) {
        console.log('Failed to update cloud:', e)
      }
      
      // 再更新本地数据
      await storage.set('matches', newMatches)
      
      wx.hideLoading()
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      })
      
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/history/history'
        })
      }, 1000)
    } catch (error) {
      wx.hideLoading()
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
      console.error('Delete match error:', error)
    }
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '福保南波万飞盘 - 比赛详情',
      path: `/pages/match-detail/match-detail?id=${this.data.matchId}`,
      imageUrl: app.globalData.shareAvatar
    }
  }
})
