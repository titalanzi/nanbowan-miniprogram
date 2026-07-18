const storage = require('../../../utils/storage.js')
const { checkTrainingPermission } = require('../../../utils/sync-helper.js')

Page({
  data: {
    trainingId: '',
    training: {},
    attendees: [],
    scoreData: [],
    dimensions: ['传盘稳定性', '接盘成功率', '跑动与空间', '战术理解', '飞盘精神'],
    scoreOptions: [2, 4, 6, 8, 10],
    submitting: false,
    loading: true,
    isCoach: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ trainingId: options.id })
      this.loadDetail()
    } else {
      this.setData({ loading: false })
    }
  },

  // 加载训练详情，初始化每个 attendee 的评分数据
  async loadDetail() {
    const trainingId = this.data.trainingId
    if (!trainingId) return

    wx.showLoading({ title: '加载中...' })

    try {
      const [data, permission] = await Promise.all([
        storage.getTrainingDetailFromCloud(trainingId),
        checkTrainingPermission(trainingId)
      ])

      const isCoach = !!(permission && permission.isCoach)

      if (data && data.training) {
        const training = data.training
        const attendees = data.attendees || []
        const dimensions = this.data.dimensions

        // 初始化 scoreData：若 attendee 已有 scores 则回显，否则默认 4 分
        const scoreData = attendees.map(attendee => {
          const existingScores = attendee.scores
          let scores, totalScore, avgScore, coachComment, scoreValues

          if (existingScores && typeof existingScores === 'object') {
            // 已有评分，回显
            scores = {}
            dimensions.forEach(dim => {
              scores[dim] = Number(existingScores[dim]) || 4
            })
            scoreValues = Object.values(scores)
            totalScore = scoreValues.reduce((sum, s) => sum + (Number(s) || 0), 0)
            avgScore = Number((totalScore / scoreValues.length).toFixed(1))
            coachComment = attendee.coachComment || ''
          } else {
            // 默认 4 分
            scores = {}
            dimensions.forEach(dim => {
              scores[dim] = 4
            })
            totalScore = 4 * dimensions.length
            avgScore = Number((totalScore / dimensions.length).toFixed(1))
            coachComment = ''
          }

          return {
            userId: attendee.userOpenId,
            userNickName: attendee.nickName || '匿名队员',
            userAvatarUrl: attendee.avatarUrl || '',
            scores,
            totalScore,
            avgScore,
            coachComment,
            hasExistingScore: !!(existingScores && typeof existingScores === 'object')
          }
        })

        this.setData({
          training,
          attendees,
          scoreData,
          isCoach,
          loading: false
        })
      } else {
        this.setData({ isCoach, loading: false })
        wx.showToast({ title: '未找到该队训', icon: 'none' })
      }
    } catch (e) {
      console.error('Load training detail error:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }

    wx.hideLoading()
  },

  // 点击评分按钮，更新对应 attendee 的对应维度分数
  onScoreTap(e) {
    const { index, dimension, value } = e.currentTarget.dataset
    const numValue = Number(value)
    const scoreData = this.data.scoreData

    if (!scoreData[index] || !scoreData[index].scores) return

    scoreData[index].scores[dimension] = numValue

    const scoreValues = Object.values(scoreData[index].scores)
    const totalScore = scoreValues.reduce((sum, s) => sum + (Number(s) || 0), 0)
    const avgScore = Number((totalScore / scoreValues.length).toFixed(1))

    scoreData[index].totalScore = totalScore
    scoreData[index].avgScore = avgScore

    this.setData({
      ['scoreData[' + index + '].scores.' + dimension]: numValue,
      ['scoreData[' + index + '].totalScore']: totalScore,
      ['scoreData[' + index + '].avgScore']: avgScore
    })
  },

  // 评语输入：仅更新数据不触发渲染，避免 textarea 失焦
  onCommentInput(e) {
    const { index } = e.currentTarget.dataset
    const value = e.detail.value
    if (this.data.scoreData[index]) {
      this.data.scoreData[index].coachComment = value
    }
  },

  // 评语失焦：将数据同步到视图层
  onCommentBlur(e) {
    const { index } = e.currentTarget.dataset
    const value = e.detail.value || ''
    if (this.data.scoreData[index]) {
      this.data.scoreData[index].coachComment = value
      this.setData({
        ['scoreData[' + index + '].coachComment']: value
      })
    }
  },

  // 提交评分：调用 submitScores 云函数
  async submitScores() {
    const { trainingId, scoreData } = this.data

    if (scoreData.length === 0) {
      wx.showToast({ title: '暂无队员可评分', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    try {
      // 组装 scores 数组
      const scores = scoreData.map(item => ({
        userOpenId: item.userId,
        scores: item.scores,
        coachComment: item.coachComment || ''
      }))

      const result = await wx.cloud.callFunction({
        name: 'submitScores',
        data: { trainingId, scores }
      })

      wx.hideLoading()

      if (result.result && result.result.success) {
        wx.showToast({ title: '评分已提交', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({ title: (result.result && result.result.error) || '提交失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('Submit scores error:', e)
      wx.showToast({ title: '网络错误', icon: 'none' })
    }

    this.setData({ submitting: false })
  }
})
