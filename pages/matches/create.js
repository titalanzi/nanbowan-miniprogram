const storage = require('../../utils/storage.js')

Page({
  data: {
    groups: [],
    members: [],
    customStats: [],
    groupAId: '',
    groupBId: '',
    groupAMembers: [],
    groupBMembers: [],
    currentScoreA: 0,
    currentScoreB: 0,
    matchDate: '',
    matchLocation: '',
    selectedTeam: 'A',
    selectedMemberId: '',
    currentStatType: 'score',
    records: [],
    showStatModal: false,
    newStatName: '',
    timeElapsed: 0,
    timerInterval: null
  },

  onLoad: function () {
    const groups = storage.get('groups') || []
    const members = storage.get('members') || []
    const customStats = storage.get('customStats') || [
      { id: 'score', name: '得分', icon: '⚡', color: '#FF6B35' },
      { id: 'assist', name: '助攻', icon: '🎯', color: '#4CAF50' },
      { id: 'd_disc', name: 'D盘', icon: '🛡️', color: '#2196F3' }
    ]
    
    const today = new Date().toISOString().split('T')[0]
    
    this.setData({ 
      groups, 
      members, 
      customStats,
      matchDate: today 
    })
  },

  onUnload: function () {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval)
    }
  },

  selectGroupA: function (e) {
    const groupId = e.currentTarget.dataset.id
    const members = storage.get('members') || []
    const groupAMembers = members.filter(m => m.groupId === groupId)
    
    this.setData({ 
      groupAId: groupId, 
      groupAMembers,
      selectedMemberId: ''
    })
  },

  selectGroupB: function (e) {
    const groupId = e.currentTarget.dataset.id
    const members = storage.get('members') || []
    const groupBMembers = members.filter(m => m.groupId === groupId)
    
    this.setData({ 
      groupBId: groupId, 
      groupBMembers,
      selectedMemberId: ''
    })
  },

  selectTeam: function (e) {
    const team = e.currentTarget.dataset.team
    this.setData({ 
      selectedTeam: team,
      selectedMemberId: ''
    })
  },

  selectMember: function (e) {
    this.setData({ selectedMemberId: e.currentTarget.dataset.id })
  },

  selectStatType: function (e) {
    this.setData({ currentStatType: e.currentTarget.dataset.type })
  },

  addRecord: function () {
    const { selectedTeam, selectedMemberId, currentStatType, customStats, groupAMembers, groupBMembers } = this.data
    
    if (!selectedMemberId) {
      wx.showToast({ title: '请选择成员', icon: 'none' })
      return
    }

    const teamMembers = selectedTeam === 'A' ? groupAMembers : groupBMembers
    const member = teamMembers.find(m => m.id === selectedMemberId)
    const stat = customStats.find(s => s.id === currentStatType)
    
    const record = {
      id: 'r_' + Date.now(),
      matchId: '',
      memberId: member.id,
      memberName: member.name,
      type: currentStatType,
      typeName: stat?.name || currentStatType,
      value: 1,
      team: selectedTeam,
      time: this.formatTime(this.data.timeElapsed)
    }

    let newRecords = [...this.data.records, record]
    
    if (currentStatType === 'score') {
      if (selectedTeam === 'A') {
        this.setData({ currentScoreA: this.data.currentScoreA + 1 })
      } else {
        this.setData({ currentScoreB: this.data.currentScoreB + 1 })
      }
    }
    
    this.setData({ records: newRecords })
    wx.showToast({ title: '记录成功', icon: 'success', duration: 800 })
  },

  formatTime: function (seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  },

  removeRecord: function (e) {
    const recordId = e.currentTarget.dataset.id
    const record = this.data.records.find(r => r.id === recordId)
    
    let newRecords = this.data.records.filter(r => r.id !== recordId)
    
    if (record.type === 'score') {
      if (record.team === 'A') {
        this.setData({ currentScoreA: Math.max(0, this.data.currentScoreA - 1) })
      } else {
        this.setData({ currentScoreB: Math.max(0, this.data.currentScoreB - 1) })
      }
    }
    
    this.setData({ records: newRecords })
  },

  startTimer: function () {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval)
      this.setData({ timerInterval: null })
    } else {
      const timer = setInterval(() => {
        this.setData({ timeElapsed: this.data.timeElapsed + 1 })
      }, 1000)
      this.setData({ timerInterval: timer })
    }
  },

  resetTimer: function () {
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval)
    }
    this.setData({ timeElapsed: 0, timerInterval: null })
  },

  showAddStatModal: function () {
    this.setData({ showStatModal: true, newStatName: '' })
  },

  closeStatModal: function () {
    this.setData({ showStatModal: false })
  },

  addCustomStat: function () {
    const { newStatName, customStats } = this.data
    if (!newStatName.trim()) {
      wx.showToast({ title: '请输入统计项名称', icon: 'none' })
      return
    }

    const colors = ['#FF6B35', '#4CAF50', '#2196F3', '#FDD835', '#8E24AA', '#00ACC1']
    const newStat = {
      id: 'stat_' + Date.now(),
      name: newStatName.trim(),
      icon: '📊',
      color: colors[customStats.length % colors.length]
    }

    const updatedStats = [...customStats, newStat]
    storage.set('customStats', updatedStats)
    this.setData({ customStats: updatedStats, showStatModal: false })
    wx.showToast({ title: '添加成功', icon: 'success' })
  },

  finishMatch: function () {
    const { groupAId, groupBId, currentScoreA, currentScoreB, matchDate, matchLocation, records } = this.data
    
    if (!groupAId || !groupBId) {
      wx.showToast({ title: '请选择两支队伍', icon: 'none' })
      return
    }

    if (groupAId === groupBId) {
      wx.showToast({ title: '不能选择同一支队伍', icon: 'none' })
      return
    }

    const match = {
      id: 'match_' + Date.now(),
      groupAId,
      groupBId,
      groupAScore: currentScoreA,
      groupBScore: currentScoreB,
      date: matchDate,
      location: matchLocation || '未知地点',
      status: 'finished',
      createdAt: new Date().toISOString()
    }

    let matches = storage.get('matches') || []
    let allRecords = storage.get('records') || []
    
    matches.push(match)
    const matchRecords = records.map(r => ({ ...r, matchId: match.id }))
    allRecords.push(...matchRecords)
    
    storage.set('matches', matches)
    storage.set('records', allRecords)
    
    if (this.data.timerInterval) {
      clearInterval(this.data.timerInterval)
    }

    wx.showToast({ 
      title: '比赛结束', 
      icon: 'success',
      duration: 1500 
    })
    
    setTimeout(() => {
      wx.navigateBack()
    }, 1500)
  },

  cancelMatch: function () {
    wx.showModal({
      title: '提示',
      content: '确定要取消这场比赛吗？所有记录将丢失',
      success: (res) => {
        if (res.confirm) {
          if (this.data.timerInterval) {
            clearInterval(this.data.timerInterval)
          }
          wx.navigateBack()
        }
      }
    })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 创建比赛',
      path: '/pages/matches/create',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
