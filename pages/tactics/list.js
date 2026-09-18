Page({
  data: {
    tactics: [],
    loading: true
  },

  onShow() {
    this.loadTactics()
  },

  onPullDownRefresh() {
    this.loadTactics(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadTactics(done) {
    if (!this.data.loading) {
      this.setData({ loading: true })
    }
    wx.cloud.callFunction({
      name: 'getTacticList'
    }).then(res => {
      const result = res.result || {}
      const rawList = (result.data && result.data.list) || []
      const list = rawList.map(t => {
        const players = t.players || []
        const p0 = players[0] || {}
        const p1 = players[1] || {}
        const colorMap = { blue: '#3498DB', red: '#E74C3C' }
        return {
          id: t.id,
          name: t.name,
          stepCount: t.stepCount || 0,
          playerCount: t.playerCount || 0,
          updatedAt: this._formatTime(t.updatedAt),
          hasDisc: !!t.hasDisc,
          p0Color: colorMap[p0.color] || '#E74C3C',
          p0Name: p0.id || 'D1',
          p1Color: colorMap[p1.color] || '#3498DB',
          p1Name: p1.id || 'O1'
        }
      })
      this.setData({ tactics: list, loading: false })
      done && done()
    }).catch(err => {
      console.error('Load tactics error:', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
      done && done()
    })
  },

  _formatTime(iso) {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso
      const pad = n => (n < 10 ? '0' + n : '' + n)
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    } catch (e) {
      return iso
    }
  },

  createNew() {
    wx.navigateTo({ url: '/pages/tactics/index' })
  },

  openTactic(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/tactics/index?id=' + id })
  },

  deleteTactic(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除战术',
      content: '确定要删除这个战术板吗？',
      confirmText: '删除',
      confirmColor: '#EF4444',
      success: (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        wx.cloud.callFunction({
          name: 'deleteTactic',
          data: { id }
        }).then(r => {
          wx.hideLoading()
          if (r.result && r.result.success) {
            const list = this.data.tactics.filter(t => t.id !== id)
            this.setData({ tactics: list })
            wx.showToast({ title: '已删除', icon: 'success' })
          } else {
            wx.showToast({
              title: (r.result && r.result.message) || '删除失败',
              icon: 'none'
            })
          }
        }).catch(err => {
          wx.hideLoading()
          console.error('deleteTactic error:', err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  },

  shareTactic(e) {
    // 由 button open-type="share" 触发，实际分享内容在 onShareAppMessage 中返回
  },

  onShareAppMessage(e) {
    // 来自 button open-type="share" 的分享
    const ds = (e && e.target && e.target.dataset) || {}
    const id = ds.id || ''
    const name = ds.name || '来看看这个战术'
    return {
      title: '战术板：' + name,
      path: '/pages/tactics/view?id=' + id,
      imageUrl: '/images/战术板.png'
    }
  }
})
