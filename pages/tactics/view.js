function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(deepClone)
  const copy = {}
  for (const key in obj) copy[key] = deepClone(obj[key])
  return copy
}

Page({
  data: {
    statusBarHeight: 20,
    loading: true,
    loadError: false,
    errorMsg: '',
    progressText: '正在加载战术...'
  },

  onLoad(options) {
    try {
      const sysInfo = wx.getSystemInfoSync()
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    } catch (e) {}

    const id = options && options.id
    const code = options && options.code

    if (!id && !code) {
      this.setData({
        loading: false,
        loadError: true,
        errorMsg: '分享链接无效'
      })
      return
    }

    this._copyToMine(id, code)
  },

  // 流程：拉取分享者战术 → 保存到本地 → 跳转编辑页（用户保存时生成自己的副本）
  _copyToMine(id, code) {
    wx.cloud.callFunction({
      name: 'getTactic',
      data: { id, code }
    }).then(res => {
      const result = res.result || {}
      if (!result.success || !result.data) {
        this.setData({
          loading: false,
          loadError: true,
          errorMsg: result.message || '战术不存在或已被删除'
        })
        return
      }

      // 如果是自己的战术，直接跳到编辑页
      if (result.isOwner && id) {
        this.setData({ progressText: '打开战术...' })
        wx.redirectTo({
          url: '/pages/tactics/index?id=' + id,
          fail: () => {
            this.setData({
              loading: false,
              loadError: true,
              errorMsg: '跳转失败，请重试'
            })
          }
        })
        return
      }

      const tactic = result.data
      const source = result.isSnapshot ? (tactic || {}) : tactic
      const steps = (source.steps || []).map((s, i) => ({
        id: s.id || ('step_' + i),
        number: i + 1,
        playerPositions: s.playerPositions || [],
        discPosition: s.discPosition,
        description: s.description || ''
      }))

      const players = []
      const allOnField = new Set()
      steps.forEach(step => {
        step.playerPositions.forEach(p => {
          allOnField.add(p.id)
          if (!players.find(pl => pl.id === p.id)) {
            players.push({ id: p.id, color: p.color })
          }
        })
      })

      const tacticData = {
        name: source.name || '分享的战术',
        steps,
        currentIndex: source.currentIndex || 0,
        playerCount: allOnField.size,
        stepCount: steps.length,
        players,
        hasDisc: !!(steps[0] && steps[0].discPosition)
      }

      // 保存到本地，跳转编辑器
      wx.setStorageSync('sharedTactic', tacticData)
      wx.redirectTo({
        url: '/pages/tactics/index?from=share',
        fail: () => {
          this.setData({
            loading: false,
            loadError: true,
            errorMsg: '跳转失败，请重试'
          })
        }
      })
    }).catch(err => {
      console.error('getTactic error:', err)
      this.setData({
        loading: false,
        loadError: true,
        errorMsg: '加载失败，请稍后重试'
      })
    })
  },

  onBack() {
    // view 页是 redirectTo 进入的，无上一页，直接跳回列表页
    wx.redirectTo({ url: '/pages/tactics/list' })
  },

  onRetry() {
    this.setData({
      loading: true,
      loadError: false,
      errorMsg: '',
      progressText: '正在加载战术...'
    })
    wx.redirectTo({ url: '/pages/tactics/list' })
  }
})
