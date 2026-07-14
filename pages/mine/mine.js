const storage = require('../../utils/storage.js')

Page({
  data: {
    user: {},
    inputName: '',
    inputAvatar: '',
    showRegisterModal: false,
    registerCode: '',
    showEditModal: false,
    editName: '',
    editAvatar: '',
    lastSyncTime: 0,
    avatarList: [
      '/images/touxiang/仓鼠.png',
      '/images/touxiang/伊布.png',
      '/images/touxiang/可达鸭.png',
      '/images/touxiang/可达鹅.png',
      '/images/touxiang/哈士奇.png',
      '/images/touxiang/喵猫.png',
      '/images/touxiang/奶牛猫.png',
      '/images/touxiang/妙蛙种子.png',
      '/images/touxiang/小火龙.png',
      '/images/touxiang/布偶猫.png',
      '/images/touxiang/无毛猫.png',
      '/images/touxiang/暹罗猫.png',
      '/images/touxiang/杰尼龟.png',
      '/images/touxiang/柯基.png',
      '/images/touxiang/橘猫.png',
      '/images/touxiang/法斗.png',
      '/images/touxiang/波波.png',
      '/images/touxiang/猴怪.png',
      '/images/touxiang/田园犬.png',
      '/images/touxiang/皮卡丘-2.png',
      '/images/touxiang/皮皮.png',
      '/images/touxiang/精灵蛋.png',
      '/images/touxiang/羊.png',
      '/images/touxiang/腊肠犬.png',
      '/images/touxiang/草莓.png',
      '/images/touxiang/荷兰猪.png',
      '/images/touxiang/藏獒.png',
      '/images/touxiang/边牧.png',
      '/images/touxiang/金毛.png',
      '/images/touxiang/黑猫.png'
    ]
  },

  onLoad: async function () {
    await this.loadUserFast()
    this.syncUserInBackground()
  },

  onShow: async function () {
    await this.loadUserFast()
    this.syncUserInBackground()
  },

  async loadUserFast() {
    const user = await storage.get('user') || {}
    this.setData({ user })
  },

  async syncUserInBackground() {
    const user = this.data.user
    if (!user.id) return
    
    const now = Date.now()
    if (now - this.data.lastSyncTime < 300000) {
      return
    }

    if (typeof wx.cloud === 'undefined' || !wx.cloud.callFunction) {
      return
    }

    try {
      const result = await wx.cloud.callFunction({
        name: 'getUserFromCloud'
      })
      
      if (result && result.result && result.result.success && result.result.data) {
        const cloudUser = result.result.data
        const mergedUser = {
          ...user,
          name: cloudUser.name || user.name,
          avatar: cloudUser.avatar || user.avatar,
          role: cloudUser.role || user.role,
          registered: true
        }
        
        if (JSON.stringify(mergedUser) !== JSON.stringify(user)) {
          storage.setLocal('user', mergedUser)
          this.setData({ user: mergedUser })
        }
        
        this.setData({ lastSyncTime: Date.now() })
      }
    } catch (e) {
      console.log('Background sync failed:', e)
    }
  },

  onNameInput: function (e) {
    this.setData({ inputName: e.detail.value })
  },

  selectAvatar: function (e) {
    const avatarUrl = e.currentTarget.dataset.avatar
    this.setData({ inputAvatar: avatarUrl })
  },

  selectEditAvatar: function (e) {
    const avatarUrl = e.currentTarget.dataset.avatar
    this.setData({ editAvatar: avatarUrl })
  },

  register: function() {
    const { inputName, inputAvatar } = this.data
    if (!inputName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '注册中...' })

    const doRegister = async () => {
      try {
        let openid = ''
        try {
          if (wx.cloud && wx.cloud.callFunction) {
            const loginResult = await wx.cloud.callFunction({
              name: 'getOpenId'
            })
            if (loginResult && loginResult.result && loginResult.result.openid) {
              openid = loginResult.result.openid
            }
          }
        } catch (e) {
          console.log('Failed to get openid:', e)
        }

        const userId = 'user_' + Date.now()
        const user = {
          id: userId,
          name: inputName.trim(),
          avatar: inputAvatar || '/images/touxiang/精灵蛋.png',
          openid: openid,
          registered: true,
          role: 'normal'
        }
        
        await storage.set('user', user)
        
        // 更新全局转发头像
        const app = getApp()
        app.globalData.shareAvatar = user.avatar
        
        this.syncToCloud(user)
        
        wx.hideLoading()
        this.setData({ user, inputName: '', inputAvatar: '' })
        wx.showToast({
          title: '注册成功',
          icon: 'success'
        })
      } catch (error) {
        wx.hideLoading()
        console.error('Register error:', error)
        wx.showToast({
          title: '注册失败，请重试',
          icon: 'none'
        })
      }
    }

    doRegister()
  },

  async syncToCloud(user) {
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        await wx.cloud.callFunction({
          name: 'syncUser',
          data: { user }
        })
      }
    } catch (e) {
      console.log('Failed to sync user to cloud, saved locally')
    }
  },

  createMatch: function () {
    const user = this.data.user
    if (!user || !user.id) {
      wx.showToast({
        title: '请先注册',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: '/packageA/pages/create-match/create-match'
    })
  },

  async showMyMatches() {
    const user = this.data.user
    if (!user.id) {
      wx.showToast({
        title: '请先注册',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: '/pages/my-matches/my-matches'
    })
  },

  showRegisterModal: function () {
    this.setData({
      showRegisterModal: true,
      registerCode: ''
    })
  },

  closeRegisterModal: function () {
    this.setData({ showRegisterModal: false })
  },

  showEditModal: function () {
    const { user } = this.data
    this.setData({
      showEditModal: true,
      editName: user.name || '',
      editAvatar: user.avatar || ''
    })
  },

  closeEditModal: function () {
    this.setData({ 
      showEditModal: false,
      editName: '',
      editAvatar: ''
    })
  },

  onEditNameInput: function (e) {
    this.setData({ editName: e.detail.value })
  },

  saveUserInfo: function() {
    const { editName, editAvatar, user } = this.data
    if (!editName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '保存中...' })

    const doSave = async () => {
      try {
        const updatedUser = {
          ...user,
          name: editName.trim(),
          avatar: editAvatar || user.avatar || '/images/touxiang/精灵蛋.png'
        }

        await storage.set('user', updatedUser)
        
        // 更新该用户创建的所有比赛中的发起人信息
        await this.updateMatchesCreatorInfo(updatedUser)
        
        this.syncToCloud(updatedUser)
        
        // 更新全局转发头像
        const app = getApp()
        app.globalData.shareAvatar = updatedUser.avatar
        
        wx.hideLoading()
        this.setData({ 
          user: updatedUser,
          showEditModal: false,
          editName: '',
          editAvatar: ''
        })
        wx.showToast({
          title: '修改成功',
          icon: 'success'
        })
      } catch (error) {
        wx.hideLoading()
        console.error('Save error:', error)
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        })
      }
    }

    doSave()
  },

  // 更新该用户创建的所有比赛中的发起人信息
  updateMatchesCreatorInfo: async function(updatedUser) {
    try {
      const matches = await storage.get('matches') || []
      let hasUpdate = false
      
      console.log('Updating matches for user:', updatedUser)
      console.log('Total matches:', matches.length)
      
      const updatedMatches = matches.map(match => {
        // 如果比赛是当前用户创建的，则更新发起人信息
        if (match.creatorId === updatedUser.id) {
          hasUpdate = true
          console.log('Updating match:', match.id, 'old avatar:', match.creatorAvatar, 'new avatar:', updatedUser.avatar)
          return {
            ...match,
            creatorName: updatedUser.name,
            creatorAvatar: updatedUser.avatar,
            updatedAt: new Date().toISOString()
          }
        }
        return match
      })
      
      if (hasUpdate) {
        // 先同步到云端，再更新本地
        try {
          if (wx.cloud && wx.cloud.callFunction) {
            // 遍历更新后的比赛，逐个同步到云端
            for (const match of updatedMatches) {
              if (match.creatorId === updatedUser.id) {
                console.log('Syncing match to cloud:', match.id)
                await wx.cloud.callFunction({
                  name: 'syncMatch',
                  data: { match: match }
                })
              }
            }
          }
        } catch (e) {
          console.log('Cloud sync failed:', e)
        }
        
        // 再更新本地
        await storage.set('matches', updatedMatches)
        console.log('Matches updated locally')
        
      } else {
        console.log('No matches found for this user to update')
      }
    } catch (e) {
      console.error('Update matches creator info failed:', e)
    }
  },

  onCodeInput: function (e) {
    this.setData({ registerCode: e.detail.value })
  },

  submitRegisterCode: function() {
    const { registerCode, user } = this.data
    if (registerCode === 'kangtianyu') {
      wx.showLoading({ title: '更新中...' })
      
      const doUpdate = async () => {
        try {
          const newUser = { ...user, role: 'assistant' }
          await storage.set('user', newUser)
          
          this.syncToCloud(newUser)
          
          wx.hideLoading()
          this.setData({
            user: newUser,
            showRegisterModal: false,
            registerCode: ''
          })
          wx.showToast({
            title: '恭喜成为主理人助理',
            icon: 'success'
          })
        } catch (error) {
          wx.hideLoading()
          console.error('Update role error:', error)
          wx.showToast({
            title: '更新失败，请重试',
            icon: 'none'
          })
        }
      }

      doUpdate()
    } else {
      wx.showToast({
        title: '注册码不正确',
        icon: 'none'
      })
    }
  },

  stopPropagation: function () {
    // 阻止事件冒泡
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 个人中心',
      path: '/pages/mine/mine',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
