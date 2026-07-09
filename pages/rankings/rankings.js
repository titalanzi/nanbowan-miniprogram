const storage = require('../../utils/storage.js')

Page({
  data: {
    activeTab: 'member',
    statType: 'score',
    memberRankings: [],
    groupRankings: [],
    mvpRankings: [],
    customStats: [],
    statOptions: [
      { id: 'score', name: '得分' },
      { id: 'assist', name: '助攻' },
      { id: 'd_disc', name: 'D盘' },
      { id: 'turnover', name: '烂盘' }
    ]
  },

  onLoad: function () {
    this.loadData()
  },

  onShow: function () {
    this.loadData()
  },

  loadData: function () {
    const members = storage.get('members') || []
    const groups = storage.get('groups') || []
    const matches = storage.get('matches') || []
    const records = storage.get('records') || []
    const customStats = storage.get('customStats') || []

    const memberRankings = this.calculateMemberRankings(members, records, customStats)
    const groupRankings = this.calculateGroupRankings(groups, matches, records)
    const mvpRankings = this.calculateMVPRankings(memberRankings)

    const allStatOptions = [...this.data.statOptions]
    customStats.forEach(stat => {
      if (!allStatOptions.find(s => s.id === stat.id)) {
        allStatOptions.push({ id: stat.id, name: stat.name })
      }
    })

    this.setData({
      memberRankings,
      groupRankings,
      mvpRankings,
      customStats,
      statOptions: allStatOptions
    })
  },

  calculateMemberRankings: function (members, records, customStats) {
    const statIds = ['score', 'assist', 'd_disc', 'turnover', ...customStats.map(s => s.id)]
    
    return members.map(member => {
      const memberRecords = records.filter(r => r.memberId === member.id)
      const statValues = {}
      
      statIds.forEach(statId => {
        statValues[statId] = memberRecords
          .filter(r => r.type === statId)
          .reduce((sum, r) => sum + r.value, 0)
      })
      
      const total = memberRecords.reduce((sum, r) => sum + r.value, 0)
      
      return { ...member, ...statValues, total }
    }).filter(m => m.total > 0)
  },

  calculateGroupRankings: function (groups, matches, records) {
    return groups.map(group => {
      const groupMatches = matches.filter(m => m.groupAId === group.id || m.groupBId === group.id)
      
      const played = groupMatches.length
      const won = groupMatches.filter(m => {
        if (m.groupAId === group.id) return m.groupAScore > m.groupBScore
        return m.groupBScore > m.groupAScore
      }).length
      const lost = groupMatches.filter(m => {
        if (m.groupAId === group.id) return m.groupAScore < m.groupBScore
        return m.groupBScore < m.groupAScore
      }).length
      const drawn = groupMatches.filter(m => m.groupAScore === m.groupBScore).length
      
      const groupRecords = records.filter(r => {
        const match = matches.find(m => m.id === r.matchId)
        if (!match) return false
        return (match.groupAId === group.id && r.team === 'A') || 
               (match.groupBId === group.id && r.team === 'B')
      })
      
      const score = groupRecords.filter(r => r.type === 'score').reduce((sum, r) => sum + r.value, 0)
      const assist = groupRecords.filter(r => r.type === 'assist').reduce((sum, r) => sum + r.value, 0)
      const d_disc = groupRecords.filter(r => r.type === 'd_disc').reduce((sum, r) => sum + r.value, 0)
      
      const winRate = played > 0 ? Math.round((won / played) * 100) : 0
      
      return { 
        ...group, 
        played, 
        won, 
        lost, 
        drawn, 
        score, 
        assist, 
        d_disc,
        winRate,
        total: score + assist + d_disc
      }
    }).filter(g => g.played > 0)
  },

  switchTab: function (e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  selectStat: function (e) {
    this.setData({ statType: e.currentTarget.dataset.stat })
  },

  sortMemberRankings: function () {
    const { memberRankings, statType } = this.data
    const sorted = [...memberRankings].sort((a, b) => (b[statType] || 0) - (a[statType] || 0))
    return sorted
  },

  sortGroupRankings: function () {
    const { groupRankings } = this.data
    return [...groupRankings].sort((a, b) => b.won - a.won)
  },

  getStatValue: function (item, statType) {
    return item[statType] || 0
  },

  getStatName: function (statId) {
    const option = this.data.statOptions.find(s => s.id === statId)
    return option ? option.name : statId
  },

  getRankBadge: function (index) {
    if (index === 0) return '🥇'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return `第${index + 1}名`
  },

  calculateMVPRankings: function (memberRankings) {
    // MVP分数 = 得分 + 助攻 + D盘 - 烂盘
    const mvpData = memberRankings.map(member => {
      const score = member.score || 0
      const assist = member.assist || 0
      const d_disc = member.d_disc || 0
      const turnover = member.turnover || 0
      const mvpScore = score + assist + d_disc - turnover
      
      return {
        ...member,
        mvpScore
      }
    })
    
    // 按MVP分数降序排序
    mvpData.sort((a, b) => b.mvpScore - a.mvpScore)
    
    // 处理并列排名
    let currentRank = 1
    let prevScore = null
    
    return mvpData.map((member, index) => {
      if (prevScore !== null && member.mvpScore < prevScore) {
        currentRank = index + 1
      }
      prevScore = member.mvpScore
      
      return {
        ...member,
        mvpRank: currentRank
      }
    }).filter(m => m.mvpScore > 0)
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 排行榜',
      path: '/pages/rankings/rankings',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
