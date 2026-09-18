const storage = require('../../../utils/storage.js')
const { checkTrainingPermission } = require('../../../utils/sync-helper.js')

Page({
  data: {
    trainingId: '',
    training: {},
    attendees: [],
    permission: { isCreator: false, isCoach: false, isCaptain: false, canEdit: false },
    radarScores: [],
    coachDimensions: ['传盘选择', '进攻战术执行度', '防守战术执行度', '传盘基本功', '接盘稳定性'],
    captainDimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
    dimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
    loading: true,
    isJoined: false,
    user: null,
    showProfileModal: false,
    showJoinModal: false,
    joinName: '',
    joinAvatar: '',
    joinGender: '',
    joinRole: '',
    uploadingAvatar: false,
    joining: false,
    showCoachPicker: false,
    profileChecked: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ trainingId: options.id })
      this.loadDetail()
    } else {
      this.setData({ loading: false })
    }
  },

  onShow: async function () {
    const user = await storage.get('user')
    if (user && user.id) {
      this.setData({ user })
      if (!user.gender && !this.data.profileChecked) {
        this.setData({ profileChecked: true })
        if (wx.requirePrivacyAuthorize) {
          wx.requirePrivacyAuthorize({
            success: () => {
              this._openProfileModal(user.name || '', user.avatar || '', user.gender || '')
            },
            fail: () => {
              wx.showToast({ title: '需同意隐私协议才能完善资料', icon: 'none' })
            }
          })
        } else {
          this._openProfileModal(user.name || '', user.avatar || '', user.gender || '')
        }
      }
    } else if (!user) {
      this.setData({ profileChecked: true })
    }
    if (this.data.trainingId && !this.data.loading) {
      this.loadDetail()
    }
  },

  onShareAppMessage: function () {
    const training = this.data.training
    const title = training.title ? `${training.title} - 快来参加队训` : '南波万飞盘 - 队训'
    return {
      title: title,
      path: '/packageB/pages/training-detail/training-detail?id=' + this.data.trainingId,
      imageUrl: ''
    }
  },

  async loadDetail() {
    const trainingId = this.data.trainingId
    if (!trainingId) return

    wx.showLoading({ title: '加载中...' })

    try {
      let data = await storage.getTrainingDetailFromCloud(trainingId)
      
      

      const permission = await checkTrainingPermission(trainingId)

      if (data && data.training) {
        const training = data.training
        console.log('=== 数据加载调试 ===')
        console.log('云环境是否可用:', storage.isCloudAvailable())
        console.log('原始签到数据:', JSON.stringify(data.attendees))
        console.log('原始数据中的性别字段:', (data.attendees || []).map(a => ({ name: a.nickName, gender: a.gender, genderType: typeof a.gender })))
        
        const attendees = (data.attendees || []).map(a => {
          let gender = a.gender || ''
          console.log(`处理用户 ${a.nickName}: 原始性别=${a.gender}, 类型=${typeof a.gender}`)
          if (gender === '男' || gender === '1' || gender === 'M') gender = 'male'
          if (gender === '女' || gender === '2' || gender === 'F') gender = 'female'
          console.log(`处理后性别=${gender}`)
          return {
            ...a,
            gender: gender,
            checkInTimeText: this.formatCheckInTime(a.checkInTime)
          }
        })
        console.log('转换后签到数据:', JSON.stringify(attendees))

        const groupedAttendees = this.groupAttendeesByGroup(attendees, training.groups)
        console.log('分组后数据:', JSON.stringify(groupedAttendees))

        let radarScores = []
        if (training.scoreCompleted && attendees.length > 0) {
          radarScores = this.calculateRadarScores(attendees)
        }

        const groupScoreList = this.buildGroupScoreList(training)

        // 从训练对象读取维度配置（兼容旧数据）
        const coachDimensions = training.coachDimensions || this.data.coachDimensions
        const captainDimensions = training.captainDimensions || this.data.captainDimensions

        const user = await storage.get('user')
        this.setData({
          training,
          attendees,
          groupedAttendees,
          permission,
          radarScores,
          groupScoreList,
          coachDimensions,
          captainDimensions,
          dimensions: captainDimensions,
          user: user || null,
          loading: false
        })

        this.checkJoinStatus()
      } else {
        this.setData({ loading: false })
      }
    } catch (e) {
      console.error('Load training detail error:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }

    wx.hideLoading()
  },

  groupAttendeesByGroup(attendees, groups) {
    const countGender = (list) => {
      return list.reduce((acc, a) => {
        let gender = a.gender || ''
        if (gender === 'male' || gender === '男' || gender === '1' || gender === 'M') acc.male++
        else if (gender === 'female' || gender === '女' || gender === '2' || gender === 'F') acc.female++
        return acc
      }, { male: 0, female: 0 })
    }

    if (!Array.isArray(groups) || groups.length === 0) {
      const genderCount = countGender(attendees)
      return [{
        groupName: '全部成员',
        groupId: '',
        attendees: attendees,
        maleCount: genderCount.male,
        femaleCount: genderCount.female
      }]
    }

    const groupMap = {}
    groups.forEach(g => {
      groupMap[g.id] = {
        groupName: g.name,
        groupId: g.id,
        attendees: [],
        maleCount: 0,
        femaleCount: 0
      }
    })

    let unassignedAttendees = []

    attendees.forEach(a => {
      if (a.groupId && groupMap[a.groupId]) {
        groupMap[a.groupId].attendees.push(a)
      } else {
        unassignedAttendees.push(a)
      }
    })

    const result = Object.values(groupMap)
    result.forEach(g => {
      const genderCount = countGender(g.attendees)
      g.maleCount = genderCount.male
      g.femaleCount = genderCount.female
    })

    result.sort((a, b) => {
      const indexA = groups.findIndex(g => g.id === a.groupId)
      const indexB = groups.findIndex(g => g.id === b.groupId)
      return indexA - indexB
    })

    if (unassignedAttendees.length > 0) {
      const genderCount = countGender(unassignedAttendees)
      result.push({
        groupName: '未分配',
        groupId: '_unassigned',
        attendees: unassignedAttendees,
        maleCount: genderCount.male,
        femaleCount: genderCount.female
      })
    }

    return result
  },

  buildGroupScoreList(training) {
    if (!training || !Array.isArray(training.groups) || training.groups.length === 0) {
      return []
    }

    const groupScores = training.groupScores || {}
    const dimensions = this.data.coachDimensions

    return training.groups.map(group => {
      const scoreData = groupScores[group.id] || {}
      const scores = scoreData.scores || {}
      const scoreValues = Object.values(scores).map(v => Number(v) || 0)
      const totalScore = scoreValues.reduce((sum, s) => sum + s, 0)
      const avgScore = scoreValues.length > 0 ? Number((totalScore / scoreValues.length).toFixed(1)) : 0

      return {
        groupId: group.id,
        groupName: group.name,
        scores,
        totalScore,
        avgScore,
        comment: scoreData.comment || '',
        hasScore: scoreValues.length > 0
      }
    })
  },

  async checkJoinStatus() {
    const { training, attendees, user } = this.data
    if (!training || !training.id || !user || !user.openid) {
      this.setData({ isJoined: false })
      return
    }

    const joined = attendees.some(a => a.userOpenId === user.openid)
    this.setData({ isJoined: joined })
  },

  formatCheckInTime(timeStr) {
    if (!timeStr) return ''
    try {
      const d = new Date(timeStr)
      if (isNaN(d.getTime())) return timeStr
      const pad = n => (n < 10 ? '0' + n : '' + n)
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    } catch (e) {
      return timeStr
    }
  },

  calculateRadarScores(attendees) {
    const dimensions = this.data.captainDimensions
    const sums = {}
    dimensions.forEach(dim => { sums[dim] = 0 })
    let count = 0

    attendees.forEach(attendee => {
      if (attendee.scores) {
        count++
        dimensions.forEach(dim => {
          sums[dim] += Number(attendee.scores[dim]) || 0
        })
      }
    })

    if (count === 0) return []
    return dimensions.map(dim => Number((sums[dim] / count).toFixed(1)))
  },

  async joinTraining() {
    const { user, training } = this.data

    if (!training || !training.id) return
    if (training.status === '已结束') {
      wx.showToast({ title: '队训已结束', icon: 'none' })
      return
    }

    if (!user || !user.id) {
      if (wx.requirePrivacyAuthorize) {
        wx.requirePrivacyAuthorize({
          success: () => {
            this._openProfileModal('', '', '')
          },
          fail: () => {
            wx.showToast({ title: '需同意隐私协议才能加入队训', icon: 'none' })
          }
        })
      } else {
        this._openProfileModal('', '', '')
      }
      return
    }

    const missing = []
    if (!user.name) missing.push('昵称')
    if (!user.avatar) missing.push('头像')
    if (!user.gender) missing.push('性别')
    if (missing.length > 0) {
      if (wx.requirePrivacyAuthorize) {
        wx.requirePrivacyAuthorize({
          success: () => {
            this._openProfileModal(user.name || '', user.avatar || '', user.gender || '')
          },
          fail: () => {
            wx.showToast({ title: '需同意隐私协议才能完善资料', icon: 'none' })
          }
        })
      } else {
        this._openProfileModal(user.name || '', user.avatar || '', user.gender || '')
      }
      return
    }

    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => {
          this._openGroupModal()
        },
        fail: () => {
          wx.showToast({ title: '需同意隐私协议才能加入队训', icon: 'none' })
        }
      })
    } else {
      this._openGroupModal()
    }
  },

  _openProfileModal(name, avatar, gender) {
    this.setData({
      showProfileModal: true,
      joinName: name || '',
      joinAvatar: avatar || '',
      joinGender: gender || ''
    })
  },

  closeProfileModal() {
    this.setData({
      showProfileModal: false,
      joinName: '',
      joinAvatar: '',
      joinGender: ''
    })
  },

  _openGroupModal() {
    this.setData({
      showJoinModal: true,
      joinRole: ''
    })
  },

  async submitProfile() {
    const { joinName, joinAvatar, joinGender, user } = this.data
    if (!joinName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!joinAvatar) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }
    if (!joinGender) {
      wx.showToast({ title: '请选择性别', icon: 'none' })
      return
    }

    let nextUser
    if (user && user.id) {
      nextUser = {
        ...user,
        name: joinName.trim(),
        avatar: joinAvatar || '',
        gender: joinGender
      }
    } else {
      let openid = user && user.openid ? user.openid : ''
      if (!openid) {
        try {
          if (wx.cloud && wx.cloud.callFunction) {
            const result = await wx.cloud.callFunction({ name: 'getOpenId' })
            if (result && result.result && result.result.openid) {
              openid = result.result.openid
            }
          }
        } catch (e) {
          console.log('Get openid failed:', e)
        }
      }
      nextUser = {
        id: 'user_' + Date.now(),
        name: joinName.trim(),
        avatar: joinAvatar || '',
        gender: joinGender,
        openid: openid,
        registered: true,
        role: 'normal'
      }
    }

    await storage.set('user', nextUser)
    console.log('=== 资料保存调试 ===')
    console.log('保存的用户数据:', JSON.stringify(nextUser))
    console.log('保存后从 storage 获取:', JSON.stringify(await storage.get('user')))

    this.setData({
      user: nextUser,
      showProfileModal: false,
      joinName: '',
      joinAvatar: '',
      joinGender: ''
    })
    console.log('保存后 this.data.user:', JSON.stringify(this.data.user))
    wx.showToast({ title: '资料已保存', icon: 'success' })
  },

  onJoinRoleSelect(e) {
    const role = e.currentTarget.dataset.role
    this.setData({ joinRole: role })
  },

  async submitGroup() {
    const { user, training, joinRole } = this.data
    console.log('=== 加入队训调试 ===')
    console.log('当前用户数据:', JSON.stringify(user))
    console.log('用户性别:', user ? user.gender : '无用户')
    console.log('用户性别类型:', user ? typeof user.gender : '无用户')
    console.log('选择的 joinRole:', joinRole)

    if (!joinRole) {
      wx.showToast({ title: '请选择加入方式', icon: 'none' })
      return
    }

    this.setData({ joining: true })
    wx.showLoading({ title: '加入中...' })

    const isCoach = joinRole === '_coach'
    const groupId = joinRole === '_unassigned' ? '' : joinRole
    console.log('解析后的参数:', { isCoach, groupId, trainingId: this.data.trainingId })

    let cloudSuccess = false
    let alreadyCheckedIn = false

    try {
      if (wx.cloud && wx.cloud.callFunction) {
        const res = await wx.cloud.callFunction({
          name: 'checkInTraining',
          data: {
            trainingId: this.data.trainingId,
            userName: user.name,
            userAvatar: user.avatar || '',
            userGender: user.gender || '',
            groupId: groupId || '',
            isCoach: isCoach
          }
        })

        console.log('云函数返回:', JSON.stringify(res.result))
        const result = res && res.result
        if (result && result.success) {
          cloudSuccess = true
          alreadyCheckedIn = result.alreadyCheckedIn
        }
      }
    } catch (e) {
      console.error('Cloud checkInTraining error:', e)
    }

    if (!cloudSuccess) {
      alreadyCheckedIn = false
    }

    wx.hideLoading()

    if (alreadyCheckedIn) {
      wx.showToast({ title: '您已加入', icon: 'none' })
    } else {
      wx.showToast({ title: '加入成功', icon: 'success' })
      wx.vibrateShort && wx.vibrateShort({ type: 'medium' })
    }

    this.setData({
      showJoinModal: false,
      joining: false,
      isJoined: true,
      joinRole: ''
    })

    this.loadDetail()
  },

  closeJoinModal() {
    this.setData({
      showJoinModal: false,
      joinRole: ''
    })
  },

  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    this.setData({ uploadingAvatar: true })
    const doUpload = async () => {
      try {
        let openid = ''
        try {
          if (wx.cloud && wx.cloud.callFunction) {
            const loginResult = await wx.cloud.callFunction({ name: 'getOpenId' })
            if (loginResult && loginResult.result && loginResult.result.openid) {
              openid = loginResult.result.openid
            }
          }
        } catch (e) {
          console.log('Failed to get openid:', e)
        }
        const fileID = await storage.uploadAvatarToCloud(tempPath, openid)
        this.setData({ joinAvatar: fileID, uploadingAvatar: false })
      } catch (err) {
        console.error('onChooseAvatar upload failed:', err)
        this.setData({ uploadingAvatar: false })
        wx.showToast({ title: '上传失败，请重试', icon: 'none' })
      }
    }
    doUpload()
  },

  onNickname(e) {
    const nickname = e.detail.nickname
    if (nickname) {
      this.setData({ joinName: nickname })
    }
  },

  onJoinNameInput(e) {
    this.setData({ joinName: e.detail.value })
  },

  onJoinGenderSelect(e) {
    this.setData({ joinGender: e.currentTarget.dataset.gender })
  },

  async endTraining() {
    const trainingId = this.data.trainingId
    wx.showModal({
      title: '结束队训',
      content: '确定要结束这场队训吗？结束后将无法再加入。',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          try {
            const result = await wx.cloud.callFunction({
              name: 'endTraining',
              data: { trainingId }
            })
            wx.hideLoading()
            if (result.result && result.result.success) {
              wx.showToast({ title: '队训已结束', icon: 'success' })
              this.loadDetail()
            } else {
              wx.showToast({ title: (result.result && result.result.error) || '结束失败', icon: 'none' })
            }
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '网络错误', icon: 'none' })
          }
        }
      }
    })
  },

  goToScore() {
    wx.navigateTo({
      url: '/packageB/pages/training-score/training-score?id=' + this.data.trainingId
    })
  },

  goToPeerComment() {
    wx.navigateTo({
      url: '/packageB/pages/training-peer-comment/training-peer-comment?id=' + this.data.trainingId
    })
  },

  goToManage() {
    wx.navigateTo({
      url: '/packageB/pages/training-manage/training-manage?id=' + this.data.trainingId
    })
  },

  openCoachPicker() {
    if (this.data.attendees.length === 0) {
      wx.showToast({ title: '暂无可选队员', icon: 'none' })
      return
    }
    this.setData({ showCoachPicker: true })
  },

  closeCoachPicker() {
    this.setData({ showCoachPicker: false })
  },

  async selectCoach(e) {
    const { openid, name, avatar } = e.currentTarget.dataset
    if (!openid) return

    wx.showLoading({ title: '设置中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'setTrainingCoach',
        data: {
          trainingId: this.data.trainingId,
          coachOpenId: openid,
          coachName: name || '',
          coachAvatar: avatar || ''
        }
      })
      wx.hideLoading()
      const result = res && res.result
      if (result && result.success) {
        wx.showToast({ title: '教练已设置', icon: 'success' })
        this.setData({ showCoachPicker: false })
        this.loadDetail()
      } else {
        wx.showToast({
          title: (result && result.error) || '设置失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('Set coach error:', err)
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  noop() {}
})
