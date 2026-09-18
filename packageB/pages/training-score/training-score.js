const storage = require('../../../utils/storage.js')
const { checkTrainingPermission } = require('../../../utils/sync-helper.js')

Page({
  data: {
    trainingId: '',
    training: {},
    attendees: [],
    scoreData: [],
    coachDimensions: ['传盘选择', '进攻战术执行度', '防守战术执行度', '传盘基本功', '接盘稳定性'],
    captainDimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
    dimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
    scoreOptions: [2, 4, 6, 8, 10],
    submitting: false,
    loading: true,
    isCoach: false,
    isCaptain: false,
    captainGroupId: '',
    canScore: false,
    groupScoreData: [],
    submittingGroupScore: false
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
      const isCaptain = !!(permission && permission.isCaptain)
      const captainGroupId = permission && permission.captainGroupId || ''
      const canScore = isCoach || isCaptain

      console.log('=== 评分页面权限调试 ===')
      console.log('permission:', JSON.stringify(permission))
      console.log('isCoach:', isCoach, 'isCaptain:', isCaptain, 'canScore:', canScore)
      console.log('captainGroupId:', captainGroupId)
      console.log('队员总数:', (data && data.attendees) ? data.attendees.length : 0)

      if (data && data.training) {
        const training = data.training
        const attendees = data.attendees || []
        const coachDimensions = this.data.coachDimensions
        const captainDimensions = this.data.captainDimensions

        // 队员评分：使用 captainDimensions（队长评价队员的维度）
        let scoreData = []
        if (!isCoach) {
          let filteredAttendees = attendees
          if (isCaptain && captainGroupId) {
            filteredAttendees = attendees.filter(a => a.groupId === captainGroupId)
            console.log('队长过滤后队员数:', filteredAttendees.length)
          } else {
            console.log('不过滤队员，显示全部')
          }

          scoreData = filteredAttendees.map(attendee => {
            const existingScores = attendee.scores
            let scores, totalScore, avgScore, coachComment, scoreValues

            if (existingScores && typeof existingScores === 'object') {
              scores = {}
              captainDimensions.forEach(dim => {
                scores[dim] = Number(existingScores[dim]) || 6
              })
              scoreValues = Object.values(scores)
              totalScore = scoreValues.reduce((sum, s) => sum + (Number(s) || 0), 0)
              avgScore = Number((totalScore / scoreValues.length).toFixed(1))
              coachComment = attendee.coachComment || ''
            } else {
              scores = {}
              captainDimensions.forEach(dim => {
                scores[dim] = 6
              })
              totalScore = 6 * captainDimensions.length
              avgScore = Number((totalScore / captainDimensions.length).toFixed(1))
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
              hasExistingScore: !!(existingScores && typeof existingScores === 'object'),
              groupId: attendee.groupId || ''
            }
          })
        }

        // 分组评分：使用 coachDimensions（教练评价分组的维度）
        const groupScoreData = []
        if (isCoach && Array.isArray(training.groups) && training.groups.length > 0) {
          const groupScores = training.groupScores || {}
          training.groups.forEach(group => {
            const existingGroupScore = groupScores[group.id]
            let scores, totalScore, avgScore, comment

            if (existingGroupScore && existingGroupScore.scores) {
              scores = {}
              coachDimensions.forEach(dim => {
                scores[dim] = Number(existingGroupScore.scores[dim]) || 6
              })
              const scoreValues = Object.values(scores)
              totalScore = scoreValues.reduce((sum, s) => sum + (Number(s) || 0), 0)
              avgScore = Number((totalScore / scoreValues.length).toFixed(1))
              comment = existingGroupScore.comment || ''
            } else {
              scores = {}
              coachDimensions.forEach(dim => {
                scores[dim] = 6
              })
              totalScore = 6 * coachDimensions.length
              avgScore = Number((totalScore / coachDimensions.length).toFixed(1))
              comment = ''
            }

            groupScoreData.push({
              groupId: group.id,
              groupName: group.name,
              scores,
              totalScore,
              avgScore,
              comment
            })
          })
        }

        // 用于显示的 attendees
        let displayAttendees = attendees
        if (isCaptain && captainGroupId) {
          displayAttendees = attendees.filter(a => a.groupId === captainGroupId)
        }

        // 教练用 coachDimensions，队长用 captainDimensions
        const dimensions = isCoach ? coachDimensions : captainDimensions

        this.setData({
          training,
          attendees: displayAttendees,
          scoreData,
          groupScoreData,
          isCoach,
          isCaptain,
          captainGroupId,
          canScore,
          dimensions,
          loading: false
        })
      } else {
        this.setData({ isCoach, isCaptain, canScore, loading: false })
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

  // 点击分组评分按钮
  onGroupScoreTap(e) {
    const { index, dimension, value } = e.currentTarget.dataset
    const numValue = Number(value)
    const groupScoreData = this.data.groupScoreData

    if (!groupScoreData[index] || !groupScoreData[index].scores) return

    groupScoreData[index].scores[dimension] = numValue

    const scoreValues = Object.values(groupScoreData[index].scores)
    const totalScore = scoreValues.reduce((sum, s) => sum + (Number(s) || 0), 0)
    const avgScore = Number((totalScore / scoreValues.length).toFixed(1))

    groupScoreData[index].totalScore = totalScore
    groupScoreData[index].avgScore = avgScore

    this.setData({
      ['groupScoreData[' + index + '].scores.' + dimension]: numValue,
      ['groupScoreData[' + index + '].totalScore']: totalScore,
      ['groupScoreData[' + index + '].avgScore']: avgScore
    })
  },

  // 分组评语输入
  onGroupCommentInput(e) {
    const { index } = e.currentTarget.dataset
    const value = e.detail.value
    if (this.data.groupScoreData[index]) {
      this.data.groupScoreData[index].comment = value
    }
  },

  // 分组评语失焦
  onGroupCommentBlur(e) {
    const { index } = e.currentTarget.dataset
    const value = e.detail.value || ''
    if (this.data.groupScoreData[index]) {
      this.data.groupScoreData[index].comment = value
      this.setData({
        ['groupScoreData[' + index + '].comment']: value
      })
    }
  },

  // 提交分组评分
  async submitGroupScores() {
    const { trainingId, groupScoreData, isCoach } = this.data

    if (!isCoach) {
      wx.showToast({ title: '无评分权限', icon: 'none' })
      return
    }

    if (groupScoreData.length === 0) {
      wx.showToast({ title: '暂无分组可评分', icon: 'none' })
      return
    }

    this.setData({ submittingGroupScore: true })
    wx.showLoading({ title: '提交中...' })

    try {
      const groupScores = groupScoreData.map(g => ({
        groupId: g.groupId,
        scores: g.scores,
        comment: g.comment || ''
      }))

      const result = await wx.cloud.callFunction({
        name: 'submitScores',
        data: { trainingId, groupScores }
      })

      wx.hideLoading()

      if (result.result && result.result.success) {
        wx.showToast({ title: '分组评分已提交', icon: 'success' })
        this.setData({ submittingGroupScore: false })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({ title: (result.result && result.result.error) || '提交失败', icon: 'none' })
        this.setData({ submittingGroupScore: false })
      }
    } catch (e) {
      wx.hideLoading()
      console.error('Submit group scores error:', e)
      this.setData({ submittingGroupScore: false })
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  // 提交评分：调用 submitScores 云函数
  async submitScores() {
    const { trainingId, scoreData, canScore } = this.data

    if (!canScore) {
      wx.showToast({ title: '无评分权限', icon: 'none' })
      return
    }

    if (scoreData.length === 0) {
      wx.showToast({ title: '暂无队员可评分', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中...' })

    try {
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
