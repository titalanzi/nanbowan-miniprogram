const mockData = require('./data/mockData.js')
const storage = require('./utils/storage.js')
const privacy = require('./utils/privacy.js')

App({
  onLaunch: function () {
    wx.cloud.init({
      env: 'cloudbase-d1gy9zpsb97f7c289',
      traceUser: true
    })

    mockData.initData()

    // 注册全局隐私授权监听
    privacy.setupPrivacyAuthorization()

    // 启动时预拉取数据
    this.prefetchData()

    // 加载用户信息用于转发
    this.loadUserForShare()
  },
  
  globalData: {
    userInfo: null,
    preloadedMatches: null,
    preloadedTime: 0,   // 预拉取时间戳，用于判断有效期
    matchListDirty: false, // 比赛列表变更标记：创建/结束比赛后置位，首页回前台强制刷新
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
      // 预拉取羁绊配置（进入小程序时缓存，打开比赛记录时直接读取）
      await storage.syncBonds()
    } catch (e) {
      console.log('Prefetch failed:', e)
    }
  },
  
  async loadUserForShare() {
    try {
      let user = await storage.get('user')
      if (!user || !user.id) {
        const { syncUserFromCloud } = require('./utils/sync-helper.js')
        user = await syncUserFromCloud()
      }
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
