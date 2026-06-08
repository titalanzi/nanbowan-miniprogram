const mockData = require('./data/mockData.js')
const cloud = require('./utils/cloud.js')
const storage = require('./utils/storage.js')

App({
  onLaunch: function () {
    cloud.initCloud('cloudbase-d1gy9zpsb97f7c289')
    
    // 先清理错误的用户数据
    this.cleanupWrongUserData()
    
    mockData.initData()
    
    // 启动时预拉取数据
    this.prefetchData()
    
    // 加载用户信息用于转发
    this.loadUserForShare()
  },
  
  // 清理错误的用户数据
  async cleanupWrongUserData() {
    try {
      const user = await storage.get('user')
      // 如果用户ID是 user_001，就清理掉
      if (user && user.id === 'user_001') {
        console.log('清理错误的用户数据:', user)
        await storage.remove('user')
        console.log('已清理 user_001 数据，请重新注册')
      }
    } catch (e) {
      console.log('清理用户数据失败:', e)
    }
  },
  
  globalData: {
    userInfo: null,
    preloadedMatches: null,
    shareAvatar: '/images/banner.jpg' // 默认转发图片
  },
  
  // 预拉取数据函数
  async prefetchData() {
    try {
      console.log('App prefetching data...')
      const matches = await storage.syncMatches()
      this.globalData.preloadedMatches = matches
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
        this.globalData.shareAvatar = user.avatar
        console.log('Share avatar updated:', user.avatar)
      }
    } catch (e) {
      console.log('Load user for share failed:', e)
    }
  }
})