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
    groups: [],           // 分组配置
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

  // 添加分组
  addGroup: function () {
    const groups = this.data.groups
    groups.push({ id: 'g_' + Date.now(), name: '' })
    this.setData({ groups })
  },

  // 删除分组
  removeGroup: function (e) {
    const idx = e.currentTarget.dataset.index
    const groups = this.data.groups
    groups.splice(idx, 1)
    this.setData({ groups })
  },

  // 分组名称输入
  onGroupNameInput: function (e) {
    const idx = e.currentTarget.dataset.index
    const groups = this.data.groups
    groups[idx].name = e.detail.value
    this.setData({ groups })
  },

  // 提交创建队训
  async submitTraining() {
    const { title, date, startTime, endTime, location, description, user, submitting, groups } = this.data

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
    wx.showLoading({ title: '创建中...', mask: true })

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
      groups: groups.filter(g => g.name.trim()).map(g => ({ id: g.id, name: g.name.trim() })),
      coaches: [],
      status: '报名中',
      creatorId: user.id || '',
      creatorName: user.name || '',
      creatorAvatar: user.avatar || '',
      dimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
      coachDimensions: ['传盘选择', '进攻战术执行度', '防守战术执行度', '传盘基本功', '接盘稳定性'],
      captainDimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
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
        wx.hideLoading()
        wx.showToast({ title: '创建成功', icon: 'success' })
        const serverTraining = result.data || training
        setTimeout(() => {
          wx.redirectTo({
            url: '/packageB/pages/training-detail/training-detail?id=' + serverTraining.id
          })
        }, 1000)
      } else {
        wx.hideLoading()
        wx.showToast({ title: (result && result.error) || '创建失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    } catch (err) {
      console.error('createTraining error:', err)
      wx.hideLoading()
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
