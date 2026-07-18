const storage = require('../../../utils/storage.js')
const { checkTrainingPermission } = require('../../../utils/sync-helper.js')

Page({
  data: {
    trainingId: '',
    training: {},
    attendees: [],
    permission: { isCreator: false, isCoach: false, canEdit: false },
    radarScores: [],
    dimensions: ['传盘稳定性', '接盘成功率', '跑动与空间', '战术理解', '飞盘精神'],
    loading: true,
    isJoined: false,
    user: null,
    showJoinModal: false,
    joinName: '',
    joinAvatar: '',
    uploadingAvatar: false,
    joining: false,
    showCoachPicker: false
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
    }
    if (this.data.trainingId && !this.data.loading) {
      this.checkJoinStatus()
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
      const data = await storage.getTrainingDetailFromCloud(trainingId)
      const permission = await checkTrainingPermission(trainingId)

      if (data && data.training) {
        const training = data.training
        const attendees = (data.attendees || []).map(a => ({
          ...a,
          checkInTimeText: this.formatCheckInTime(a.checkInTime)
        }))

        let radarScores = []
        if (training.scoreCompleted && attendees.length > 0) {
          radarScores = this.calculateRadarScores(attendees)
        }

        const user = await storage.get('user')
        this.setData({
          training,
          attendees,
          permission,
          radarScores,
          user: user || null,
          loading: false
        })

        this.checkJoinStatus()
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '未找到该队训', icon: 'none' })
      }
    } catch (e) {
      console.error('Load training detail error:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }

    wx.hideLoading()
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
    const dimensions = this.data.dimensions
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
      this.setData({
        showJoinModal: true,
        joinName: '',
        joinAvatar: ''
      })
      return
    }

    this.doJoin(user.name, user.avatar)
  },

  async doJoin(userName, userAvatar) {
    if (this.data.joining) return
    if (!userName || !userName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ joining: true })
    wx.showLoading({ title: '加入中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'checkInTraining',
        data: {
          trainingId: this.data.trainingId,
          userName: userName.trim(),
          userAvatar: userAvatar || ''
        }
      })

      wx.hideLoading()
      const result = res && res.result

      if (result && result.success) {
        if (result.alreadyCheckedIn) {
          wx.showToast({ title: '您已加入', icon: 'none' })
        } else {
          wx.showToast({ title: '加入成功', icon: 'success' })
          wx.vibrateShort && wx.vibrateShort({ type: 'medium' })
        }

        this.setData({
          showJoinModal: false,
          joining: false,
          isJoined: true
        })

        this.loadDetail()
      } else {
        this.setData({ joining: false })
        wx.showToast({
          title: (result && result.error) || '加入失败',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('Join training error:', e)
      this.setData({ joining: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  closeJoinModal() {
    this.setData({ showJoinModal: false })
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
          console.log('Get openid failed:', e)
        }
        const fileID = await storage.uploadAvatarToCloud(tempPath, openid || 'temp')
        this.setData({ joinAvatar: fileID, uploadingAvatar: false })
      } catch (err) {
        console.error('Avatar upload failed:', err)
        this.setData({ uploadingAvatar: false })
        wx.showToast({ title: '头像上传失败', icon: 'none' })
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

  async submitJoin() {
    const { joinName, joinAvatar } = this.data
    if (!joinName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    let openid = ''
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

    const userId = 'user_' + Date.now()
    const newUser = {
      id: userId,
      name: joinName.trim(),
      avatar: joinAvatar || '',
      openid: openid,
      registered: true,
      role: 'normal'
    }
    await storage.set('user', newUser)

    try {
      if (wx.cloud && wx.cloud.callFunction) {
        await wx.cloud.callFunction({
          name: 'syncUser',
          data: { user: newUser }
        })
      }
    } catch (e) {
      console.log('Sync user failed:', e)
    }

    this.setData({ user: newUser })
    this.doJoin(joinName.trim(), joinAvatar)
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
