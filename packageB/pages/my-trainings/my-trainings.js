const storage = require('../../../utils/storage.js')

Page({
  data: {
    radarScores: [],
    dimensions: ["传盘成功率", "接盘稳定性", "防守执行率"],
    trainings: [],
    overallAvg: 0,
    hasScores: false,
    loading: true
  },

  onLoad() {
    this.loadMyTrainings()
  },

  onShow() {
    this.loadMyTrainings()
  },

  async loadMyTrainings() {
    try {
      this.setData({ loading: true })
      // 调用 getMyTrainings 云函数获取数据
      const result = await wx.cloud.callFunction({ name: 'getMyTrainings' })
      const trainings = (result.result && result.result.data) || []

      // 聚合计算综合雷达图分数
      const dimensions = this.data.dimensions
      const scoreSums = new Array(dimensions.length).fill(0)
      let scoreCount = 0

      trainings.forEach(item => {
        // 顶层挂载 id，便于 wx:key 使用
        if (item.training) {
          item.id = item.training.id
          // 格式化时间显示
          if (item.training.startTime) {
            const date = new Date(item.training.startTime)
            if (!isNaN(date.getTime())) {
              const y = date.getFullYear()
              const m = String(date.getMonth() + 1).padStart(2, '0')
              const d = String(date.getDate()).padStart(2, '0')
              item.training.formattedTime = `${y}-${m}-${d}`
            }
          }
        }

        if (item.myScore && item.myScore.scores) {
          dimensions.forEach((dim, index) => {
            scoreSums[index] += item.myScore.scores[dim] || 0
          })
          scoreCount++
        }
      })

      if (scoreCount > 0) {
        const radarScores = scoreSums.map(sum => +(sum / scoreCount).toFixed(1))
        const totalAvg = +(radarScores.reduce((a, b) => a + b, 0) / dimensions.length).toFixed(1)
        this.setData({ radarScores, overallAvg: totalAvg, hasScores: true, trainings })
      } else {
        this.setData({ hasScores: false, trainings })
      }
    } catch (e) {
      console.error('Load my trainings failed:', e)
    } finally {
      this.setData({ loading: false })
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/packageB/pages/training-detail/training-detail?id=${id}` })
  }
})
