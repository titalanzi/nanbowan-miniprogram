Page({
  data: {
    loading: true
  },

  onLoad: function (options) {
    let trainingId = ''
    if (options && options.trainingId) {
      trainingId = options.trainingId
    } else if (options && options.scene) {
      const scene = decodeURIComponent(options.scene)
      trainingId = scene.replace('T_', '')
    }

    if (trainingId) {
      wx.redirectTo({
        url: '/packageB/pages/training-detail/training-detail?id=' + trainingId
      })
    } else {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/active/active' })
        }
      })
    }
  }
})
