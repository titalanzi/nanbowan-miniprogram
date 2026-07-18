Component({
  properties: {
    // 分数数组，例如 [8, 7, 6, 8, 9]
    scores: {
      type: Array,
      value: []
    },
    // 维度名称数组，例如 ['传盘稳定性', '接盘成功率', ...]
    dimensions: {
      type: Array,
      value: []
    },
    // 最大分值，默认 10
    maxValue: {
      type: Number,
      value: 10
    },
    // 主题色，默认橙色（与项目主题一致）
    themeColor: {
      type: String,
      value: '#FF6B35'
    },
    // 辅助色（渐变终点）
    subColor: {
      type: String,
      value: '#F59E0B'
    },
    // 空状态文案
    emptyText: {
      type: String,
      value: '暂无评分数据'
    },
    emptyIcon: {
      type: String,
      value: '📊'
    }
  },

  data: {
    hasData: false
  },

  observers: {
    'scores, dimensions, themeColor': function () {
      this.draw()
    }
  },

  lifetimes: {
    attached() {
      // 延迟绘制，等待 canvas 节点挂载完成
      setTimeout(() => this.draw(), 100)
    }
  },

  methods: {
    draw() {
      const { scores, dimensions, maxValue, themeColor, subColor } = this.properties
      if (!scores || !dimensions || scores.length === 0 || dimensions.length === 0) {
        this.setData({ hasData: false })
        return
      }
      this.setData({ hasData: true })
      this.drawRadar(scores, dimensions, maxValue, themeColor, subColor)
    },

    drawRadar(scores, dimensions, maxValue, themeColor, subColor) {
      const query = this.createSelectorQuery()
      query.select('#radarCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getSystemInfoSync().pixelRatio || 1
          const width = res[0].width
          const height = res[0].height

          canvas.width = width * dpr
          canvas.height = height * dpr
          ctx.scale(dpr, dpr)

          // 清空画布
          ctx.clearRect(0, 0, width, height)

          const centerX = width / 2
          const centerY = height / 2
          const maxRadius = Math.min(width, height) / 2 - 85 // 留足标签空间
          const sides = dimensions.length
          const angleStep = (Math.PI * 2) / sides
          const startAngle = -Math.PI / 2 // 从正上方开始

          // === 1. 绘制背景网格（5层正多边形） ===
          const gridLevels = 5
          for (let level = gridLevels; level >= 1; level--) {
            const levelRadius = (maxRadius * level) / gridLevels
            ctx.beginPath()
            for (let i = 0; i <= sides; i++) {
              const angle = startAngle + i * angleStep
              const x = centerX + levelRadius * Math.cos(angle)
              const y = centerY + levelRadius * Math.sin(angle)
              if (i === 0) {
                ctx.moveTo(x, y)
              } else {
                ctx.lineTo(x, y)
              }
            }
            ctx.closePath()

            // 最外层使用更深的颜色
            const alpha = 0.04 + (level / gridLevels) * 0.06
            ctx.fillStyle = `rgba(107, 114, 128, ${alpha})`
            ctx.fill()

            ctx.strokeStyle = `rgba(156, 163, 175, ${0.15 + level * 0.05})`
            ctx.lineWidth = 1
            ctx.stroke()
          }

          // === 2. 绘制从中心到顶点的轴线 ===
          for (let i = 0; i < sides; i++) {
            const angle = startAngle + i * angleStep
            const x = centerX + maxRadius * Math.cos(angle)
            const y = centerY + maxRadius * Math.sin(angle)
            ctx.beginPath()
            ctx.moveTo(centerX, centerY)
            ctx.lineTo(x, y)
            ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)'
            ctx.lineWidth = 1
            ctx.stroke()
          }

          // === 3. 绘制数据多边形（渐变填充） ===
          const points = []
          for (let i = 0; i < sides; i++) {
            const angle = startAngle + i * angleStep
            const score = Math.min(scores[i] || 0, maxValue)
            const radius = (score / maxValue) * maxRadius
            const x = centerX + radius * Math.cos(angle)
            const y = centerY + radius * Math.sin(angle)
            points.push({ x, y })
          }

          // 填充数据区域
          ctx.beginPath()
          points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y)
            else ctx.lineTo(p.x, p.y)
          })
          ctx.closePath()

          // 径向渐变填充
          const gradient = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, maxRadius
          )
          gradient.addColorStop(0, this.hexToRgba(themeColor, 0.4))
          gradient.addColorStop(1, this.hexToRgba(subColor, 0.15))
          ctx.fillStyle = gradient
          ctx.fill()

          // 描边
          ctx.strokeStyle = themeColor
          ctx.lineWidth = 3
          ctx.lineJoin = 'round'
          ctx.stroke()

          // === 4. 绘制顶点圆点（高亮） ===
          points.forEach((p, i) => {
            // 外圈光晕
            ctx.beginPath()
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
            ctx.fillStyle = this.hexToRgba(themeColor, 0.15)
            ctx.fill()

            // 主圆点
            ctx.beginPath()
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
            const dotGradient = ctx.createRadialGradient(p.x - 1, p.y - 1, 0, p.x, p.y, 6)
            dotGradient.addColorStop(0, '#FFFFFF')
            dotGradient.addColorStop(0.4, themeColor)
            dotGradient.addColorStop(1, subColor)
            ctx.fillStyle = dotGradient
            ctx.fill()

            // 描边
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = 2
            ctx.stroke()
          })

          // === 5. 绘制维度标签和分值 ===
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const labelRadius = maxRadius + 28

          dimensions.forEach((dim, i) => {
            const angle = startAngle + i * angleStep
            const labelX = centerX + labelRadius * Math.cos(angle)
            const labelY = centerY + labelRadius * Math.sin(angle)

            // 维度名称
            ctx.font = '600 18px -apple-system, "PingFang SC", sans-serif'
            ctx.fillStyle = '#374151'
            ctx.fillText(dim, labelX, labelY - 9)

            // 分值
            ctx.font = '700 20px -apple-system, "PingFang SC", sans-serif'
            ctx.fillStyle = themeColor
            ctx.fillText(scores[i] || 0, labelX, labelY + 13)
          })

          // === 6. 绘制中心点 ===
          ctx.beginPath()
          ctx.arc(centerX, centerY, 4, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(107, 114, 128, 0.4)'
          ctx.fill()
        })
    },

    // 工具函数：hex 转 rgba
    hexToRgba(hex, alpha) {
      const cleaned = hex.replace('#', '')
      const r = parseInt(cleaned.substring(0, 2), 16)
      const g = parseInt(cleaned.substring(2, 4), 16)
      const b = parseInt(cleaned.substring(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }
})
