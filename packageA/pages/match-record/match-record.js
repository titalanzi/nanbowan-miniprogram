const storage = require('../../../utils/storage.js')
const { checkPermissionFromCloud, calculateGroupStats } = require('../../../utils/sync-helper.js')

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
    const matchId = this.data.matchId
    const permission = await checkPermissionFromCloud(matchId)
    this.setData(permission)
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
      this.updateGroupStats()
    }
  },

  updateGroupStats: function () {
    const match = this.data.match
    const groupStats = calculateGroupStats(match)
    this.setData({ groupStats })
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
    this.updateGroupStats()
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
    this.updateGroupStats()
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
          this.updateGroupStats()
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
        url: '/packageA/pages/match-detail/match-detail?id=' + match.id
      })
    }, 1000)
  },

  editGroups: function () {
    if (!this.data.canEdit) {
      wx.showToast({ title: '只有比赛创建者可编辑', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/packageA/pages/edit-groups/edit-groups?id=' + this.data.matchId
    })
  },

  showGroupMembers: function () {
    this.setData({ showGroupMembersModal: true })
  },

  hideGroupMembers: function () {
    this.setData({ showGroupMembersModal: false })
  },

  // 下载分组图片到相册
  downloadGroupImage: async function () {
    wx.showLoading({ title: '生成图片中...' })
    try {
      const tempFilePath = await this.drawGroupImage()
      wx.hideLoading()
      wx.showLoading({ title: '保存中...' })
      await wx.saveImageToPhotosAlbum({ filePath: tempFilePath })
      wx.hideLoading()
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      console.error('Download group image failed:', e)
      if (e.errMsg && e.errMsg.indexOf('auth deny') !== -1) {
        wx.showModal({
          title: '需要授权',
          content: '请允许保存图片到相册',
          confirmText: '去设置',
          success: function (res) {
            if (res.confirm) {
              wx.openSetting()
            }
          }
        })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    }
  },

  // 使用 canvas 绘制分组图片
  drawGroupImage: function () {
    const self = this
    return new Promise(function (resolve, reject) {
      const query = wx.createSelectorQuery()
      query.select('#groupShareCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (!res || !res[0] || !res[0].node) {
            reject(new Error('canvas not found'))
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio

          const match = self.data.match || {}
          const groups = (match.groups || []).map(function (group) {
            return {
              ...group,
              maleCount: group.maleCount || 0,
              femaleCount: group.femaleCount || 0
            }
          })

          const width = 750
          const padding = 32
          const headerHeight = 120
          const matchInfoHeight = 140
          const footerHeight = 80
          const groupHeaderHeight = 80
          const tagHeight = 64
          const tagGap = 16
          const gridPadding = 24
          const groupCardGap = 24
          const tagsPerRow = 3
          const cardRadius = 16

          function calcGroupCardHeight(group) {
            const members = group.members || []
            const rowCount = members.length === 0 ? 1 : Math.ceil(members.length / tagsPerRow)
            const membersHeight = gridPadding + rowCount * tagHeight + (rowCount - 1) * tagGap + gridPadding
            return groupHeaderHeight + membersHeight
          }

          let groupsHeight = 0
          groups.forEach(function (group) {
            groupsHeight += calcGroupCardHeight(group) + groupCardGap
          })
          if (groups.length > 0) groupsHeight -= groupCardGap

          const totalHeight = headerHeight + matchInfoHeight + groupsHeight + footerHeight + 64

          canvas.width = width * dpr
          canvas.height = totalHeight * dpr
          ctx.scale(dpr, dpr)

          // 绘制圆角矩形
          function drawRoundRect(x, y, w, h, r) {
            ctx.beginPath()
            ctx.moveTo(x + r, y)
            ctx.arcTo(x + w, y, x + w, y + h, r)
            ctx.arcTo(x + w, y + h, x, y + h, r)
            ctx.arcTo(x, y + h, x, y, r)
            ctx.arcTo(x, y, x + w, y, r)
            ctx.closePath()
          }

          // 背景
          ctx.fillStyle = '#F8F9FB'
          ctx.fillRect(0, 0, width, totalHeight)

          // 顶部标题栏
          const gradient = ctx.createLinearGradient(0, 0, width, headerHeight)
          gradient.addColorStop(0, '#FF6B35')
          gradient.addColorStop(1, '#F59E0B')
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, width, headerHeight)

          // 标题图标（圆形）
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
          ctx.beginPath()
          ctx.arc(70, headerHeight / 2, 32, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = '#FFFFFF'
          ctx.font = 'bold 40px sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.fillText('分组成员', 118, headerHeight / 2)

          // 比赛信息卡片
          let y = headerHeight + 24
          ctx.fillStyle = '#FFFFFF'
          drawRoundRect(padding, y, width - padding * 2, matchInfoHeight - 24, cardRadius)
          ctx.fill()

          ctx.fillStyle = '#111827'
          ctx.font = 'bold 36px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillText(match.name || '比赛', width / 2, y + 26)

          ctx.fillStyle = '#6B7280'
          ctx.font = '24px sans-serif'
          const locationText = match.location || '未知地点'
          const dateText = match.date || ''
          ctx.fillText('📍 ' + locationText + '   📅 ' + dateText, width / 2, y + 82)

          y = headerHeight + matchInfoHeight

          // 分组卡片
          groups.forEach(function (group) {
            const cardHeight = calcGroupCardHeight(group)

            // 卡片背景
            ctx.fillStyle = '#FFFFFF'
            drawRoundRect(padding, y, width - padding * 2, cardHeight, cardRadius)
            ctx.fill()
            ctx.save()
            ctx.clip()

            // 分组头部
            ctx.fillStyle = group.color || '#FF6B35'
            ctx.fillRect(padding, y, width - padding * 2, groupHeaderHeight)

            // 组名图标
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
            ctx.beginPath()
            ctx.arc(padding + 40, y + groupHeaderHeight / 2, 24, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 30px sans-serif'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillText(group.name || '队伍', padding + 78, y + groupHeaderHeight / 2)

            // 性别统计
            const statsX = width - padding - 160
            const statsY = y + 20
            const statsW = 140
            const statsH = 40
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
            drawRoundRect(statsX, statsY, statsW, statsH, 20)
            ctx.fill()

            ctx.fillStyle = '#FFFFFF'
            ctx.font = 'bold 22px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('♂ ' + group.maleCount + ' / ♀ ' + group.femaleCount, statsX + statsW / 2, statsY + statsH / 2)

            ctx.restore()

            y += groupHeaderHeight

            // 成员网格
            const members = group.members || []
            if (members.length === 0) {
              ctx.fillStyle = '#9CA3AF'
              ctx.font = '24px sans-serif'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('暂无成员', width / 2, y + 50)
              y += 80 + groupCardGap
            } else {
              const rowCount = Math.ceil(members.length / tagsPerRow)
              const gridHeight = gridPadding + rowCount * tagHeight + (rowCount - 1) * tagGap + gridPadding
              const tagWidth = (width - padding * 2 - gridPadding * 2 - (tagsPerRow - 1) * tagGap) / tagsPerRow
              const tagRadius = 12

              members.forEach(function (member, idx) {
                const row = Math.floor(idx / tagsPerRow)
                const col = idx % tagsPerRow
                const tagX = padding + gridPadding + col * (tagWidth + tagGap)
                const tagY = y + gridPadding + row * (tagHeight + tagGap)

                // tag 背景
                ctx.fillStyle = '#F9FAFB'
                drawRoundRect(tagX, tagY, tagWidth, tagHeight, tagRadius)
                ctx.fill()

                // 序号 badge
                const badgeSize = 36
                const badgeColor = group.color || '#FF6B35'
                ctx.fillStyle = badgeColor
                ctx.beginPath()
                ctx.arc(tagX + 20 + badgeSize / 2, tagY + tagHeight / 2, badgeSize / 2, 0, Math.PI * 2)
                ctx.fill()

                ctx.fillStyle = '#FFFFFF'
                ctx.font = 'bold 20px sans-serif'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(String(idx + 1), tagX + 20 + badgeSize / 2, tagY + tagHeight / 2)

                // 性别圆点（先计算，因为需要根据圆点位置反推名字可用空间）
                const genderDotRadius = 10
                const genderDotMargin = 6  // 性别圆点与名字之间的间距
                const genderDotX = tagX + tagWidth - 24 - genderDotRadius
                const nameStartX = tagX + 64  // badge 右侧起始位置
                const nameMaxWidth = genderDotX - genderDotRadius - genderDotMargin - nameStartX

                // 名字 —— 根据可用宽度动态调整字号，防止被性别圆点遮挡
                const memberName = member.name || ''
                let nameFontSize = 24
                ctx.font = 'bold ' + nameFontSize + 'px sans-serif'
                let nameMetrics = ctx.measureText(memberName)

                if (nameMetrics.width > nameMaxWidth) {
                  // 尝试缩小字号，最小到 16px
                  nameFontSize = Math.max(16, Math.floor(nameFontSize * nameMaxWidth / nameMetrics.width))
                  ctx.font = 'bold ' + nameFontSize + 'px sans-serif'
                  nameMetrics = ctx.measureText(memberName)
                  // 如果缩小后仍然超出，做截断处理
                  if (nameMetrics.width > nameMaxWidth && memberName.length > 0) {
                    let truncated = memberName
                    while (ctx.measureText(truncated + '…').width > nameMaxWidth && truncated.length > 1) {
                      truncated = truncated.slice(0, -1)
                    }
                    ctx.fillStyle = '#374151'
                    ctx.textAlign = 'left'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(truncated + '…', nameStartX, tagY + tagHeight / 2)
                  } else {
                    ctx.fillStyle = '#374151'
                    ctx.textAlign = 'left'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(memberName, nameStartX, tagY + tagHeight / 2)
                  }
                } else {
                  ctx.fillStyle = '#374151'
                  ctx.font = 'bold ' + nameFontSize + 'px sans-serif'
                  ctx.textAlign = 'left'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(memberName, nameStartX, tagY + tagHeight / 2)
                }

                // 性别圆点
                const genderColor = member.gender === 'female' ? '#EC4899' : '#3B82F6'
                ctx.fillStyle = genderColor
                ctx.beginPath()
                ctx.arc(genderDotX, tagY + tagHeight / 2, genderDotRadius, 0, Math.PI * 2)
                ctx.fill()
              })

              y += gridHeight + groupCardGap
            }
          })

          // 底部
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, totalHeight - footerHeight, width, footerHeight)
          ctx.fillStyle = '#9CA3AF'
          ctx.font = '22px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('南波万飞盘 · 分组图片', width / 2, totalHeight - footerHeight / 2)

          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: width,
            height: totalHeight,
            destWidth: width * dpr,
            destHeight: totalHeight * dpr,
            success: function (res) {
              resolve(res.tempFilePath)
            },
            fail: function (err) {
              reject(err)
            }
          })
        })
    })
  },

  stopPropagation: function () {
    // 阻止事件冒泡
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 比赛记录',
      path: `/packageA/pages/match-record/match-record?id=${this.data.matchId}`,
      imageUrl: app.globalData.shareAvatar
    }
  }
})
