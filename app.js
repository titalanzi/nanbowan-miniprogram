const mockData = require('./data/mockData.js')
const storage = require('./utils/storage.js')

App({
  onLaunch: function () {
    wx.cloud.init({
      env: 'cloudbase-d1gy9zpsb97f7c289',
      traceUser: true
    })
    
    mockData.initData()
    
    // 启动时预拉取数据
    this.prefetchData()
    
    // 加载用户信息用于转发
    this.loadUserForShare()
  },
  
  globalData: {
    userInfo: null,
    preloadedMatches: null,
    preloadedTime: 0,   // 预拉取时间戳，用于判断有效期
    shareAvatar: '' // 由 loadUserForShare 异步更新
  },
  
  // 预拉取数据函数
  async prefetchData() {
    try {
      console.log('App prefetching data...')
      const matches = await storage.syncMatches()
      this.globalData.preloadedMatches = matches
      this.globalData.preloadedTime = Date.now()
      console.log('App prefetch complete, matches count:', matches.length)
    } catch (e) {
      console.log('Prefetch failed:', e)
    }
  },
  
  // 加载用户头像用于转发
  async loadUserForShare() {
    try {
      const user = await storage.get('user')
      if (user && user.avatar) {
        const avatar = user.avatar
        // cloud:// fileID 不能作为转发分享图，需转为 https 临时地址
        if (avatar.indexOf('cloud://') === 0 && wx.cloud && wx.cloud.getTempFileURL) {
          try {
            const res = await wx.cloud.getTempFileURL({ fileList: [avatar] })
            if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
              this.globalData.shareAvatar = res.fileList[0].tempFileURL
              console.log('Share avatar (cloud) updated:', this.globalData.shareAvatar)
              return
            }
          } catch (e) {
            console.log('Convert cloud avatar failed, fallback to raw:', e)
          }
        }
        this.globalData.shareAvatar = avatar
        console.log('Share avatar updated:', avatar)
      }
    } catch (e) {
      console.log('Load user for share failed:', e)
    }
  }
})
