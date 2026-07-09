const storage = require('../../utils/storage.js')

Page({
  data: {
    matchId: '',
    match: {},
    activeTab: '',
    rankings: [],
    mvpRankings: [],
    mvpShareImage: '',
    top3Colors: ['#F59E0B', '#9CA3AF', '#D97706'],
    canEdit: false,
    isCreator: false,
    isAssistant: false,
    groupStats: [],
    votes: {},
    spiritRankings: [],
    currentUserId: '',
    showTeamModal: false,
    currentTeamMembers: [],
    currentTeamName: ''
  },

  onLoad: async function (options) {
    if (options.id) {
      this.setData({ matchId: options.id })
    }
    
    // 获取当前用户ID
    const user = await storage.get('user') || {}
    this.setData({ currentUserId: user.id || 'anonymous' })
    
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
      if (!match.votes) match.votes = {}
      let activeTab = this.data.activeTab
      if (!activeTab && match.statTypes && match.statTypes.length > 0) {
        activeTab = match.statTypes[0].id
      }
      this.setData({ match, activeTab })
      this.calculateGroupStats()
      this.calculateRankings(activeTab)
      this.calculateMVPRankings()
      this.loadVotes()
      this.calculateSpiritRankings()
      
      // 预生成MVP截图
      setTimeout(() => {
        this.preGenerateMVPScreenshot()
      }, 500)
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

  calculateMVPRankings: function () {
    const { match } = this.data
    if (!match.records || match.records.length === 0) {
      this.setData({ mvpRankings: [] })
      return
    }

    // 计算每个成员的MVP分数: 得分 + 助攻 + D盘 - 烂盘
    const memberStats = {}
    
    match.records.forEach(record => {
      const key = record.memberId
      if (!memberStats[key]) {
        memberStats[key] = {
          memberId: record.memberId,
          memberName: record.memberName,
          groupId: record.groupId,
          groupName: record.groupName,
          groupColor: record.groupColor,
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

    // 计算MVP分数并排序
    const mvpData = Object.values(memberStats).map(member => {
      const mvpScore = member.score + member.assist + member.dDisc - member.turnover
      return { ...member, mvpScore }
    })

    // 按MVP分数降序排序
    mvpData.sort((a, b) => b.mvpScore - a.mvpScore)

    // 处理并列排名
    let currentRank = 1
    let prevScore = null
    
    const rankings = mvpData.map((member, index) => {
      if (prevScore !== null && member.mvpScore < prevScore) {
        currentRank = index + 1
      }
      prevScore = member.mvpScore
      return { ...member, mvpRank: currentRank }
    }).filter(m => m.mvpScore > 0)

    this.setData({ mvpRankings: rankings })
  },

  loadVotes: function() {
    const { match } = this.data
    if (match && match.votes) {
      this.setData({ votes: match.votes })
    }
  },

  calculateSpiritRankings: function() {
    const { match, votes, groupStats } = this.data
    if (!match || !match.groups) {
      this.setData({ spiritRankings: [] })
      return
    }

    // 收集所有队员的飞盘精神分数
    const memberSpiritScores = []

    match.groups.forEach(group => {
      if (!group.members) return
      group.members.forEach(member => {
        const memberVotes = votes[member.id] || { likes: [], dislikes: [] }
        const likes = memberVotes.likes ? memberVotes.likes.length : 0
        const dislikes = memberVotes.dislikes ? memberVotes.dislikes.length : 0
        const spiritScore = likes - dislikes

        memberSpiritScores.push({
          memberId: member.id,
          memberName: member.name,
          groupId: group.id,
          groupColor: group.color,
          likes,
          dislikes,
          spiritScore
        })
      })
    })

    // 按飞盘精神分数降序排序
    memberSpiritScores.sort((a, b) => b.spiritScore - a.spiritScore)

    // 过滤掉分数为0或负数的队员
    const positiveScores = memberSpiritScores.filter(m => m.spiritScore > 0)

    // 按排名分组，相同分数的放在同一组
    const rankGroups = []
    let currentRank = 1
    let currentGroup = []
    let prevScore = null

    positiveScores.forEach((member, index) => {
      if (prevScore !== null && member.spiritScore < prevScore) {
        if (currentGroup.length > 0) {
          rankGroups.push({
            rank: currentRank,
            spiritScore: prevScore,
            members: currentGroup
          })
        }
        currentRank = index + 1
        currentGroup = []
      }
      currentGroup.push(member)
      prevScore = member.spiritScore
    })

    // 添加最后一组
    if (currentGroup.length > 0) {
      rankGroups.push({
        rank: currentRank,
        spiritScore: prevScore,
        members: currentGroup
      })
    }

    // 只保留前三名的排名组
    const top3Groups = rankGroups.filter(g => g.rank <= 3)

    this.setData({ spiritRankings: top3Groups })
  },

  hasVoted: function(memberId, type) {
    const { votes, currentUserId } = this.data
    const memberVotes = votes[memberId]
    if (!memberVotes) return false
    const list = type === 'like' ? memberVotes.likes : memberVotes.dislikes
    return list && list.includes(currentUserId)
  },

  toggleLike: function(e) {
    const { memberId, type } = e.currentTarget.dataset
    const { match, votes, currentUserId, currentTeamMembers, showTeamModal } = this.data
    
    if (!votes[memberId]) {
      votes[memberId] = { likes: [], dislikes: [] }
    }
    
    const memberVotes = votes[memberId]
    const list = type === 'like' ? memberVotes.likes : memberVotes.dislikes
    const otherList = type === 'like' ? memberVotes.dislikes : memberVotes.likes
    
    const index = list.indexOf(currentUserId)
    
    if (index > -1) {
      list.splice(index, 1)
    } else {
      const allMemberIds = Object.keys(votes)
      allMemberIds.forEach(mid => {
        if (mid !== memberId) {
          const mv = votes[mid]
          if (type === 'like' && mv.likes && mv.likes.includes(currentUserId)) {
            const idx = mv.likes.indexOf(currentUserId)
            if (idx > -1) mv.likes.splice(idx, 1)
          }
          if (type === 'dislike' && mv.dislikes && mv.dislikes.includes(currentUserId)) {
            const idx = mv.dislikes.indexOf(currentUserId)
            if (idx > -1) mv.dislikes.splice(idx, 1)
          }
        }
      })
      
      const otherIndex = otherList.indexOf(currentUserId)
      if (otherIndex > -1) {
        otherList.splice(otherIndex, 1)
      }
      list.push(currentUserId)
    }
    
    match.votes = votes
    match.updatedAt = new Date().toISOString()
    
    this.saveMatch(match)
    
    const newData = { votes, match }
    
    if (showTeamModal && currentTeamMembers) {
      const updatedMembers = currentTeamMembers.map(member => {
        const mv = votes[member.id] || { likes: [], dislikes: [] }
        return {
          ...member,
          likes: mv.likes ? mv.likes.length : 0,
          dislikes: mv.dislikes ? mv.dislikes.length : 0,
          liked: mv.likes && mv.likes.includes(currentUserId),
          disliked: mv.dislikes && mv.dislikes.includes(currentUserId)
        }
      })
      newData.currentTeamMembers = updatedMembers
    }
    
    this.setData(newData)
    this.calculateSpiritRankings()
  },

  async saveMatch(match) {
    const matches = await storage.get('matches') || []
    const index = matches.findIndex(m => m.id === match.id)
    if (index !== -1) {
      matches[index] = match
      await storage.set('matches', matches)
    }
    
    // 同步到云端
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        await wx.cloud.callFunction({
          name: 'syncMatch',
          data: { match }
        })
      }
    } catch (e) {
      console.log('Failed to sync votes to cloud:', e)
    }
  },

  showTeamMembers: function(e) {
    const { groupId } = e.currentTarget.dataset
    const { match, votes, groupStats } = this.data
    
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
      const memberVotes = votes[member.id] || { likes: [], dislikes: [] }
      return {
        ...member,
        ...stats,
        likes: memberVotes.likes ? memberVotes.likes.length : 0,
        dislikes: memberVotes.dislikes ? memberVotes.dislikes.length : 0,
        liked: memberVotes.likes && memberVotes.likes.includes(this.data.currentUserId),
        disliked: memberVotes.dislikes && memberVotes.dislikes.includes(this.data.currentUserId)
      }
    })

    this.setData({
      showTeamModal: true,
      currentTeamMembers: members,
      currentTeamName: group.name
    })
  },

  hideTeamModal: function() {
    this.setData({
      showTeamModal: false,
      currentTeamMembers: [],
      currentTeamName: ''
    })
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
    const { match, mvpRankings, mvpShareImage } = this.data
    
    // 优先使用预生成的MVP截图
    if (mvpShareImage) {
      app.globalData.shareAvatar = mvpShareImage
    } else if (mvpRankings && mvpRankings.length > 0) {
      // 如果没有预生成图片但有MVP数据，实时生成（下次转发时可用）
      this.generateMVPScreenshot().then(imageUrl => {
        if (imageUrl) {
          this.setData({ mvpShareImage: imageUrl })
          app.globalData.shareAvatar = imageUrl
        }
      }).catch(err => {
        console.log('生成MVP截图失败，使用默认图片')
      })
    }
    
    return {
      title: '南波万飞盘 - 比赛详情',
      path: `/pages/match-detail/match-detail?id=${this.data.matchId}`,
      imageUrl: app.globalData.shareAvatar
    }
  },

  preGenerateMVPScreenshot: function() {
    const { mvpRankings } = this.data
    if (!mvpRankings || mvpRankings.length === 0) {
      return
    }
    
    this.generateMVPScreenshot().then(imageUrl => {
      if (imageUrl) {
        this.setData({ mvpShareImage: imageUrl })
        app.globalData.shareAvatar = imageUrl
        console.log('MVP截图预生成成功')
      }
    }).catch(err => {
      console.log('预生成MVP截图失败:', err)
    })
  },

  generateMVPScreenshot: function() {
    return new Promise((resolve, reject) => {
      const { match, mvpRankings, groupStats } = this.data
      
      if (!mvpRankings || mvpRankings.length === 0) {
        resolve(null)
        return
      }

      const ctx = wx.createCanvasContext('mvpCanvas')
      const width = 500
      const height = 400
      
      // 绘制背景
      ctx.setFillStyle('#FFFBEB')
      ctx.fillRect(0, 0, width, height)
      
      // 绘制标题栏
      ctx.setFillStyle('#F59E0B')
      ctx.fillRect(0, 0, width, 70)
      ctx.setFillStyle('#FFFFFF')
      ctx.setFontSize(28)
      ctx.setTextAlign('center')
      ctx.fillText('🏆 MVP排行榜', width / 2, 46)
      
      // 绘制比赛名称
      ctx.setFillStyle('#92400E')
      ctx.setFontSize(22)
      ctx.fillText(match.name || '比赛', width / 2, 105)
      
      // 绘制地点和时间
      ctx.setFillStyle('#78716C')
      ctx.setFontSize(16)
      const location = match.location || '未知地点'
      const date = match.date || ''
      const infoText = location + (date ? ' · ' + date : '')
      ctx.fillText(infoText, width / 2, 125)
      
      // 绘制前3名MVP
      const startY = 145
      const itemHeight = 80
      
      mvpRankings.slice(0, 3).forEach((item, index) => {
        const y = startY + index * itemHeight
        
        // 绘制背景框
        if (index === 0) {
          ctx.setFillStyle('#FFEDD5')
          ctx.setStrokeStyle('#F59E0B')
        } else if (index === 1) {
          ctx.setFillStyle('#F3F4F6')
          ctx.setStrokeStyle('#9CA3AF')
        } else {
          ctx.setFillStyle('#FEE2E2')
          ctx.setStrokeStyle('#F87171')
        }
        ctx.fillRect(20, y, width - 40, itemHeight - 12)
        ctx.strokeRect(20, y, width - 40, itemHeight - 12)
        
        // 绘制排名图标
        ctx.setFontSize(30)
        ctx.setTextAlign('center')
        const rankText = index === 0 ? '🥇' : (index === 1 ? '🥈' : '🥉')
        ctx.fillText(rankText, 58, y + 42)
        
        // 绘制姓名
        ctx.setFillStyle('#111827')
        ctx.setFontSize(22)
        ctx.setTextAlign('left')
        const name = item.memberName || '未知'
        const truncatedName = name.length > 6 ? name.substring(0, 6) + '..' : name
        ctx.fillText(truncatedName, 100, y + 32)
        
        // 绘制分组
        ctx.setFillStyle(item.groupColor || '#6B7280')
        ctx.setFontSize(16)
        const groupName = item.groupName || ''
        const truncatedGroup = groupName.length > 6 ? groupName.substring(0, 6) + '..' : groupName
        ctx.fillText(truncatedGroup, 100, y + 56)
        
        // 绘制MVP分数
        ctx.setFillStyle('#F59E0B')
        ctx.setFontSize(28)
        ctx.setTextAlign('right')
        ctx.fillText(item.mvpScore.toString(), width - 32, y + 34)
        
        // 绘制详细数据
        ctx.setFillStyle('#6B7280')
        ctx.setFontSize(14)
        const detailText = `${item.score}分 ${item.assist}助 ${item.dDisc}D -${item.turnover}烂`
        ctx.fillText(detailText, width - 32, y + 58)
      })
      
      ctx.draw(true, () => {
        setTimeout(() => {
          wx.canvasToTempFilePath({
            canvasId: 'mvpCanvas',
            success: res => {
              resolve(res.tempFilePath)
            },
            fail: err => {
              console.error('生成截图失败:', err)
              reject(err)
            }
          })
        }, 300)
      })
    })
  }
})
