const storage = require('../../../utils/storage.js')

Page({
  data: {
    trainingId: '',
    training: {},
    attendees: [],
    comments: {},
    submitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ trainingId: options.id })
      this.loadDetail()
    }
  },

  // 加载训练详情，过滤掉当前用户自己
  async loadDetail() {
    const trainingId = this.data.trainingId
    if (!trainingId) return

    wx.showLoading({ title: '加载中...' })
    try {
      const data = await storage.getTrainingDetailFromCloud(trainingId)
      if (data) {
        const { training, attendees } = data
        // 获取当前用户 openid，过滤掉自己的记录
        const currentOpenId = await storage.getOpenIdSafe()
        const otherAttendees = (attendees || []).filter(a => a.userOpenId !== currentOpenId)
        this.setData({ training, attendees: otherAttendees })
      }
    } catch (e) {
      console.error('Load training detail failed:', e)
    } finally {
      wx.hideLoading()
    }
  },

  // 输入评语：仅更新数据不触发渲染，避免 textarea 失焦
  onCommentInput(e) {
    const userId = e.currentTarget.dataset.userId
    const value = e.detail.value
    this.data.comments[userId] = value
  },

  // 失焦时同步到视图层
  onCommentBlur(e) {
    const userId = e.currentTarget.dataset.userId
    const value = e.detail.value || ''
    this.data.comments[userId] = value
    this.setData({
      [`comments.${userId}`]: value
    })
  },

  // 提交所有队友互评，使用 Promise.all 并行提交
  async submitPeerComments() {
    const { comments, trainingId, submitting } = this.data
    if (submitting) return

    // 过滤出有内容的评语
    const entries = Object.keys(comments)
      .map(userId => ({ userId, content: (comments[userId] || '').trim() }))
      .filter(item => item.content.length > 0)

    if (entries.length === 0) {
      wx.showToast({ title: '请至少填写一条评价', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    try {
      const promises = entries.map(item =>
        wx.cloud.callFunction({
          name: 'submitPeerComment',
          data: {
            trainingId,
            targetUserId: item.userId,
            content: item.content
          }
        })
      )
      await Promise.all(promises)

      wx.hideLoading()
      wx.showToast({ title: '提交成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1000)
    } catch (e) {
      console.error('Submit peer comments failed:', e)
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
