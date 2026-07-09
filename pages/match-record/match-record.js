const storage = require('../../utils/storage.js')

Page({
  data: {
    matchId: '',
    match: {},
    selectedGroupIndex: null,
    selectedMemberIndex: null,
    currentGroup: {},
    canEdit: false,
    isCreator: false,
    isAssistant: false,
    showGroupMembersModal: false,
    groupStats: [],
    showTeamStatsModal: false,
    currentTeamMembers: [],
    currentTeamName: ''
  },

  onLoad: async function (options) {
    if (options.id) {
      this.setData({ matchId: options.id })
    }
    await this.checkPermission()
    await this.loadMatchFast()
  },

  onShow: async function () {
    await this.checkPermission()
    await this.loadMatchFast()
  },

  async checkPermission() {
    const user = await storage.get('user') || {}
    const isAssistant = user.role === 'assistant'
    const matchId = this.data.matchId
    
    console.log('=== checkPermission 调试 ===')
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
    console.log('===========================')
    
    this.setData({ 
      isAssistant,
      isCreator,
      canEdit
    })
  },

  updateCanEdit() {
    const { isCreator, isAssistant } = this.data
    this.setData({ canEdit: isCreator || isAssistant })
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
      
      // 为每个分组预先计算性别数量
      if (match.groups && Array.isArray(match.groups)) {
        match.groups = match.groups.map(group => {
          let maleCount = 0
          let femaleCount = 0
          if (group.members && Array.isArray(group.members)) {
            group.members.forEach(member => {
              if (member.gender === 'female') {
                femaleCount++
              } else {
                maleCount++
              }
            })
          }
          return {
            ...group,
            maleCount: maleCount,
            femaleCount: femaleCount
          }
        })
      }
      
      this.setData({ match })
      this.calculateGroupStats()
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
      let turnover = 0
      for (let j = 0; j < match.records.length; j++) {
        const record = match.records[j]
        if (record.groupId === group.id) {
          if (record.statType === 'stat_score') score++
          else if (record.statType === 'stat_assist') assist++
          else if (record.statType === 'stat_d') dDisc++
          else if (record.statType === 'stat_turnover') turnover++
        }
      }
      stats.push({
        groupId: group.id,
        groupName: group.name,
        color: group.color,
        score: score,
        assist: assist,
        dDisc: dDisc,
        turnover: turnover
      })
    }
    this.setData({ groupStats: stats })
  },

  showTeamStats: function(e) {
    const { groupId } = e.currentTarget.dataset
    const { match } = this.data
    
    const group = match.groups.find(g => g.id === groupId)
    if (!group || !group.members) return

    // 获取队员的详细统计数据
    const memberStats = {}
    if (match.records) {
      match.records.forEach(record => {
        const key = record.memberId
        if (!memberStats[key]) {
          memberStats[key] = {
            memberId: record.memberId,
            memberName: record.memberName,
            score: 0,
            assist: 0,
            dDisc: 0,
            turnover: 0
          }
        }
        if (record.statType === 'stat_score') memberStats[key].score++
        else if (record.statType === 'stat_assist') memberStats[key].assist++
        else if (record.statType === 'stat_d') memberStats[key].dDisc++
        else if (record.statType === 'stat_turnover') memberStats[key].turnover++
      })
    }

    // 构建队员数据
    const members = group.members.map(member => {
      const stats = memberStats[member.id] || { score: 0, assist: 0, dDisc: 0, turnover: 0 }
      return {
        ...member,
        ...stats
      }
    })

    this.setData({
      showTeamStatsModal: true,
      currentTeamMembers: members,
      currentTeamName: group.name
    })
  },

  hideTeamStatsModal: function() {
    this.setData({
      showTeamStatsModal: false,
      currentTeamMembers: [],
      currentTeamName: ''
    })
  },

  syncMatchInBackground(matchId) {
    setTimeout(() => {
      storage.syncMatches().then(cloudMatches => {
        if (cloudMatches && cloudMatches.length > 0) {
          const cloudMatch = cloudMatches.find(m => m.id === matchId)
          if (cloudMatch) {
            const localMatch = this.data.match
            if (localMatch && localMatch.status === 'finished') {
              return
            }
            if (localMatch && new Date(cloudMatch.updatedAt) > new Date(localMatch.updatedAt || 0)) {
              this.setData({ match: cloudMatch })
            }
          }
        }
      }).catch(e => {
        console.log('Background sync completed')
      })
    }, 1000)
  },

  async saveMatch(match) {
    const matches = await storage.get('matches') || []
    const index = matches.findIndex(m => m.id === match.id)
    if (index !== -1) {
      matches[index] = match
    } else {
      matches.push(match)
    }
    
    console.log('Saving match:', match.id, 'status:', match.status)
    
    // 先同步到云端
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        const result = await wx.cloud.callFunction({
          name: 'syncMatch',
          data: { match }
        })
        console.log('Match synced to cloud:', result)
      }
    } catch (e) {
      console.error('Failed to sync match to cloud:', e)
    }
    
    // 再保存到本地
    await storage.set('matches', matches)
    console.log('Match saved to local storage')
  },

  syncToCloud(match) {
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        wx.cloud.callFunction({
          name: 'syncMatch',
          data: { match: match }
        })
      }
    } catch (e) {
      console.log('Failed to sync match to cloud:', e)
    }
  },

  getGroupScore: function (groupId) {
    const { match } = this.data;
    if (!match.records) return 0;
    const scoreRecords = match.records.filter(r => 
      r.groupId === groupId && r.statType === 'stat_score'
    );
    return scoreRecords.length;
  },

  getGroupMaleCount: function (group) {
    if (!group || !group.members || !Array.isArray(group.members)) {
      return 0;
    }
    return group.members.filter(function(m) { 
      return !m.gender || m.gender === 'male';
    }).length;
  },

  getGroupFemaleCount: function (group) {
    if (!group || !group.members || !Array.isArray(group.members)) {
      return 0;
    }
    return group.members.filter(function(m) { 
      return m.gender === 'female';
    }).length;
  },

  selectGroup: function (e) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    const index = e.currentTarget.dataset.index
    this.setData({
      selectedGroupIndex: index,
      selectedMemberIndex: null,
      currentGroup: this.data.match.groups[index]
    })
  },

  selectMember: function (e) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    const index = e.currentTarget.dataset.index
    this.setData({ selectedMemberIndex: index })
  },

  async addRecord(e) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    const stat = e.currentTarget.dataset.stat
    const { match, selectedGroupIndex, selectedMemberIndex } = this.data
    
    if (selectedGroupIndex === null || selectedMemberIndex === null) {
      wx.showToast({ title: '请先选择队伍和球员', icon: 'none' })
      return
    }

    const group = match.groups[selectedGroupIndex]
    const member = group.members[selectedMemberIndex]
    const now = new Date()
    const time = now.getHours().toString().padStart(2, '0') + ':' + 
                 now.getMinutes().toString().padStart(2, '0')

    const record = {
      id: 'record_' + Date.now(),
      groupId: group.id,
      groupName: group.name,
      groupColor: group.color,
      memberId: member.id,
      memberName: member.name,
      statType: stat.id,
      statName: stat.name,
      statColor: stat.color,
      time: time,
      timestamp: now.toISOString()
    }

    const newRecords = [record, ...(match.records || [])]
    const newMatch = { ...match, records: newRecords, updatedAt: now.toISOString() }
    
    this.setData({ match: newMatch })
    this.calculateGroupStats()
    await this.saveMatch(newMatch)
    
    wx.showToast({ title: '记录成功', icon: 'success' })
  },

  showUndoConfirm: function () {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    const { match } = this.data
    if (!match.records || match.records.length === 0) {
      wx.showToast({ title: '暂无记录可撤销', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认撤销',
      content: '确定要撤销上一条记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.undoRecord()
        }
      }
    })
  },

  async undoRecord() {
    const { match } = this.data
    if (!match.records || match.records.length === 0) return

    const newRecords = match.records.slice(1)
    const newMatch = { ...match, records: newRecords, updatedAt: new Date().toISOString() }
    
    this.setData({ match: newMatch })
    this.calculateGroupStats()
    await this.saveMatch(newMatch)
    
    wx.showToast({ title: '已撤销', icon: 'success' })
  },

  deleteRecord: function (e) {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    const recordId = e.currentTarget.dataset.recordid
    const { match } = this.data

    wx.showModal({
      title: '删除记录',
      content: '确定要删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          const newRecords = match.records.filter(r => r.id !== recordId)
          const newMatch = { ...match, records: newRecords, updatedAt: new Date().toISOString() }
          
          this.setData({ match: newMatch })
          this.calculateGroupStats()
          await this.saveMatch(newMatch)
          
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  showFinishConfirm: function () {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    wx.showModal({
      title: '结束比赛',
      content: '确定要结束这场比赛吗？',
      success: (res) => {
        if (res.confirm) {
          this.finishMatch()
        }
      }
    })
  },

  async finishMatch() {
    const { match } = this.data
    const newMatch = { ...match, status: 'finished', updatedAt: new Date().toISOString() }
    
    console.log('Finishing match:', newMatch.id, 'status:', newMatch.status)
    
    this.setData({ match: newMatch })
    await this.saveMatch(newMatch)
    
    wx.showToast({
      title: '比赛已结束',
      icon: 'success'
    })

    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/match-detail/match-detail?id=' + match.id
      })
    }, 1000)
  },

  editGroups: function () {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/edit-groups/edit-groups?id=' + this.data.matchId
    })
  },

  showGroupMembers: function () {
    this.setData({ showGroupMembersModal: true })
  },

  hideGroupMembers: function () {
    this.setData({ showGroupMembersModal: false })
  },

  stopPropagation: function () {
    // 阻止事件冒泡
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 比赛记录',
      path: `/pages/match-record/match-record?id=${this.data.matchId}`,
      imageUrl: app.globalData.shareAvatar
    }
  }
})
