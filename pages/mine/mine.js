const storage = require('../../utils/storage.js')
const { verifyAssistantCode, syncUserFromCloud } = require('../../utils/sync-helper.js')

Page({
  data: {
    user: {},
    inputName: '',
    inputAvatar: '',        // 微信头像/相册上传后得到的 cloud://fileID（或临时路径兜底）
    inputGender: '',        // 注册用性别
    agreed: false,          // 是否已主动勾选同意协议（默认 false，不得默认勾选）
    showRegisterModal: false,
    registerCode: '',
    showEditModal: false,
    editName: '',
    editAvatar: '',
    editGender: '',         // 编辑用性别
    uploadingAvatar: false, // 头像上传中状态
    lastSyncTime: 0,
    needGenderSetup: false   // 是否需要补填性别
  },

  onLoad: async function () {
    await this.loadUserFast()
    this.syncUserInBackground()
  },

  onShow: async function () {
    await this.loadUserFast()

    const { user } = this.data
    // 已注册用户若 gender 为空，先直接拉取云端数据，避免误弹（云端可能已有 gender）
    if (user && user.id && user.registered && !user.gender) {
      let cloudGender = ''
      try {
        if (typeof wx.cloud !== 'undefined' && wx.cloud.callFunction) {
          const result = await wx.cloud.callFunction({ name: 'getUserFromCloud' })
          if (result && result.result && result.result.success && result.result.data) {
            const cloudUser = result.result.data
            cloudGender = cloudUser.gender || ''
            if (cloudGender) {
              const mergedUser = { ...user, gender: cloudGender }
              if (cloudUser.name) mergedUser.name = cloudUser.name
              if (cloudUser.avatar) mergedUser.avatar = cloudUser.avatar
              this.setData({ user: mergedUser, lastSyncTime: Date.now() })
            }
          }
        }
      } catch (e) {
        console.log('Fetch cloud gender failed:', e)
      }

      // 同步后仍无 gender，自动弹出编辑弹窗补填
      const updatedUser = this.data.user
      if (updatedUser && updatedUser.id && updatedUser.registered && !updatedUser.gender) {
        this._openEditModal(updatedUser)
      }
    } else {
      this.syncUserInBackground()
    }
  },

  async loadUserFast() {
    const user = await storage.get('user') || {}
    this.setData({ user })
  },

  async syncUserInBackground() {
    const user = this.data.user
    // 本地无用户数据：尝试从云端恢复（缓存清除后重新进入场景）
    if (!user.id) {
      try {
        const restoredUser = await syncUserFromCloud()
        if (restoredUser && restoredUser.id) {
          this.setData({ user: restoredUser })
          // 触发全局转发头像更新
          const app = getApp()
          if (app.loadUserForShare) {
            app.loadUserForShare()
          }
        }
      } catch (e) {
        console.log('Restore user from cloud failed:', e)
      }
      return
    }

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
        const DEFAULT_AVATAR = 'cloud://cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250/avatars/morentouxiang.jpg'
        const mergedUser = {
          ...user,
          name: cloudUser.name || user.name,
          avatar: cloudUser.avatar || user.avatar || DEFAULT_AVATAR,
          gender: cloudUser.gender || user.gender || '',
          role: cloudUser.role || user.role,
          registered: true
        }
        
        if (JSON.stringify(mergedUser) !== JSON.stringify(user)) {
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

  // 注册区域性别选择
  onInputGenderSelect: function (e) {
    this.setData({ inputGender: e.currentTarget.dataset.gender })
  },

  // 微信头像选择：chooseAvatar 返回临时文件，上传云存储后得到 cloud://fileID
  onChooseAvatar: function (e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    const user = this.data.user
    const key = user.registered ? 'editAvatar' : 'inputAvatar'
    this.setData({ uploadingAvatar: true })
    const doUpload = async () => {
      try {
        const fileID = await storage.uploadAvatarToCloud(tempPath, user.openid)
        this.setData({ [key]: fileID, uploadingAvatar: false })
      } catch (err) {
        console.error('onChooseAvatar upload failed:', err)
        this.setData({ uploadingAvatar: false })
      }
    }
    doUpload()
  },

  // 微信昵称快捷填充（input type="nickname" 触发）
  onNickname: function (e) {
    const nickname = e.detail.nickname
    if (nickname) {
      const source = e.currentTarget.dataset.source || 'input'
      const key = source === 'edit' ? 'editName' : 'inputName'
      this.setData({ [key]: nickname })
    }
  },

  register: function() {
    const { inputName, inputAvatar, inputGender } = this.data

    // 合规要求：必须由用户主动勾选同意，不得默认同意
    if (!this.data.agreed) {
      wx.showToast({
        title: '请先阅读并勾选同意协议',
        icon: 'none',
        duration: 2500
      })
      return
    }

    if (!inputName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }
    if (!inputGender) {
      wx.showToast({
        title: '请选择性别',
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
        const DEFAULT_AVATAR = 'cloud://cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250/avatars/morentouxiang.jpg'
        const user = {
          id: userId,
          name: inputName.trim(),
          avatar: inputAvatar || DEFAULT_AVATAR,
          gender: inputGender,
          openid: openid,
          registered: true,
          role: 'normal',
          // 合规留痕：记录用户主动同意协议的时间与版本
          agreedAt: Date.now(),
          agreementVersion: 'v1.0'
        }

        await storage.set('user', user)

        // 更新全局转发头像
        const app = getApp()
        app.globalData.shareAvatar = user.avatar

        wx.hideLoading()
        this.setData({ user, inputName: '', inputAvatar: '', inputGender: '', agreed: false })
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

  createMatch: function () {
    const user = this.data.user
    if (!user || !user.id) {
      wx.showToast({
        title: '请先注册',
        icon: 'none'
      })
      return
    }
    if (!user.avatar) {
      wx.showModal({
        title: '请完善头像',
        content: '创建比赛前需要先设置头像',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.showEditModal()
          }
        }
      })
      return
    }
    wx.navigateTo({
      url: '/packageA/pages/create-match/create-match'
    })
  },

  createTraining: function () {
    const user = this.data.user
    if (!user || !user.id) {
      wx.showToast({
        title: '请先注册',
        icon: 'none'
      })
      return
    }
    if (!user.avatar) {
      wx.showModal({
        title: '请完善头像',
        content: '创建队训前需要先设置头像',
        confirmText: '去设置',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.showEditModal()
          }
        }
      })
      return
    }
    wx.navigateTo({
      url: '/packageB/pages/create-training/create-training'
    })
  },

  goMyTrainings: function () {
    const user = this.data.user
    if (!user || !user.id) {
      wx.showToast({
        title: '请先注册',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: '/packageB/pages/my-trainings/my-trainings'
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

  goTactics: function () {
    wx.navigateTo({
      url: '/pages/tactics/list'
    })
  },

  goFrisbeeVocab: function () {
    wx.navigateTo({
      url: '/pages/frisbee-vocab/frisbee-vocab'
    })
  },

  goFrisbeeRules: function () {
    wx.navigateTo({
      url: '/pages/frisbee-rules/frisbee-rules'
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

    // 进入编辑弹窗前，主动触发隐私授权
    // 不检查 needAuthorization，直接调用 requirePrivacyAuthorize
    // 已授权会直接 success，未授权会弹出官方授权弹窗
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => {
          this._openEditModal(user)
        },
        fail: () => {
          wx.showToast({ title: '需同意隐私协议才能修改头像', icon: 'none' })
        }
      })
    } else {
      this._openEditModal(user)
    }
  },

  _openEditModal(user) {
    this.setData({
      showEditModal: true,
      editName: user.name || '',
      editAvatar: user.avatar || '',
      editGender: user.gender || ''
    })
  },

  closeEditModal: function () {
    this.setData({
      showEditModal: false,
      editName: '',
      editAvatar: '',
      editGender: ''
    })
  },

  onEditNameInput: function (e) {
    this.setData({ editName: e.detail.value })
  },

  // 性别选择
  onGenderSelect: function (e) {
    this.setData({ editGender: e.currentTarget.dataset.gender })
  },

  saveUserInfo: function() {
    const { editName, editAvatar, editGender, user } = this.data
    if (!editName.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }
    if (!editGender) {
      wx.showToast({
        title: '请选择性别',
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
          avatar: editAvatar || user.avatar || '',
          gender: editGender
        }

        await storage.set('user', updatedUser)

        // 更新该用户创建的所有比赛中的发起人信息
        await this.updateMatchesCreatorInfo(updatedUser)

        // 更新全局转发头像
        const app = getApp()
        app.globalData.shareAvatar = updatedUser.avatar

        wx.hideLoading()
        this.setData({
          user: updatedUser,
          showEditModal: false,
          editName: '',
          editAvatar: '',
          editGender: ''
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

  submitRegisterCode: async function() {
    const { registerCode, user } = this.data
    
    wx.showLoading({ title: '验证中...' })
    
    try {
      const valid = await verifyAssistantCode(registerCode)
      wx.hideLoading()
      
      if (valid) {
        wx.showLoading({ title: '更新中...' })
        const newUser = { ...user, role: 'assistant' }
        await storage.set('user', newUser)
        wx.hideLoading()
        
        this.setData({
          user: newUser,
          showRegisterModal: false,
          registerCode: ''
        })
        wx.showToast({
          title: '验证通过，已升级为主理人助理',
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: '验证码无效',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('Verify code error:', error)
      wx.showToast({
        title: '验证失败，请重试',
        icon: 'none'
      })
    }
  },

  stopPropagation: function () {
    // 阻止事件冒泡
  },

  // 勾选/取消勾选同意协议：由用户主动操作，默认不勾选
  toggleAgreement: function () {
    this.setData({ agreed: !this.data.agreed })
  },

  // 查看《用户服务协议》/《隐私政策》全文
  goAgreement: function (e) {
    const type = e.currentTarget.dataset.type === 'privacy' ? 'privacy' : 'service'
    wx.navigateTo({
      url: '/pages/agreement/agreement?type=' + type
    })
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
