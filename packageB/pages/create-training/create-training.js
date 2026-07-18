const { syncUserFromCloud } = require('../../../utils/sync-helper.js')

Page({
  data: {
    title: '',
    date: '',
    startTime: '20:30',
    endTime: '22:30',
    location: '',
    description: '',
    coachOpenId: '',
    coachName: '',
    coachAvatar: '',
    user: {},
    submitting: false
  },

  onLoad: async function () {
    // 获取今天日期作为默认值
    const today = new Date()
    const dateStr = today.getFullYear() + '-' +
      (today.getMonth() + 1).toString().padStart(2, '0') + '-' +
      today.getDate().toString().padStart(2, '0')

    // 从云端同步用户信息
    const user = await syncUserFromCloud()

    this.setData({
      date: dateStr,
      user: user || {}
    })

    // 未注册用户提示
    if (!user || !user.id) {
      wx.showModal({
        title: '提示',
        content: '请先在「我的」页面完成注册',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/mine/mine' })
        }
      })
    }
  },

  // 表单输入处理
  onTitleInput: function (e) {
    this.setData({ title: e.detail.value })
  },

  onLocationInput: function (e) {
    this.setData({ location: e.detail.value })
  },

  onDescriptionInput: function (e) {
    this.data.description = e.detail.value
  },

  onDescriptionBlur: function (e) {
    this.data.description = e.detail.value || ''
  },

  onDateChange: function (e) {
    this.setData({ date: e.detail.value })
  },

  onStartTimeChange: function (e) {
    this.setData({ startTime: e.detail.value })
  },

  onEndTimeChange: function (e) {
    this.setData({ endTime: e.detail.value })
  },

  // 提交创建队训
  async submitTraining() {
    const { title, date, startTime, endTime, location, description, user, submitting } = this.data

    // 防止重复提交
    if (submitting) return

    // 必填字段校验
    if (!title.trim()) {
      wx.showToast({ title: '请输入队训标题', icon: 'none' })
      return
    }
    if (!date) {
      wx.showToast({ title: '请选择日期', icon: 'none' })
      return
    }
    if (!location.trim()) {
      wx.showToast({ title: '请输入地点', icon: 'none' })
      return
    }

    // 时间合理性校验
    if (endTime <= startTime) {
      wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    // 组装队训对象
    const training = {
      id: 'training_' + Date.now(),
      title: title.trim(),
      startTime: date + 'T' + startTime,
      endTime: date + 'T' + endTime,
      location: location.trim(),
      description: description.trim(),
      coachOpenId: this.data.coachOpenId,
      coachName: this.data.coachName,
      coachAvatar: this.data.coachAvatar,
      status: '报名中',
      creatorId: user.id || '',
      creatorName: user.name || '',
      creatorAvatar: user.avatar || '',
      dimensions: ['传盘稳定性', '接盘成功率', '跑动与空间', '战术理解', '飞盘精神'],
      createdAt: new Date().toISOString()
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'createTraining',
        data: training
      })

      // 云函数返回的 training 包含 qrCodeKey、shortCode 等服务端字段
      const result = res && res.result
      if (result && result.success) {
        wx.showToast({ title: '创建成功', icon: 'success' })
        const serverTraining = result.data || training
        setTimeout(() => {
          wx.redirectTo({
            url: '/packageB/pages/training-detail/training-detail?id=' + serverTraining.id
          })
        }, 1000)
      } else {
        wx.showToast({ title: (result && result.error) || '创建失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (err) {
      console.error('createTraining error:', err)
      wx.showToast({ title: '创建失败，请重试', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 创建队训',
      path: '/packageB/pages/create-training/create-training',
      imageUrl: app.globalData.shareAvatar
    }
  },

  noop() {}
})
