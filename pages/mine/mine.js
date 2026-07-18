const storage = require('../../utils/storage.js')
const { verifyAssistantCode } = require('../../utils/sync-helper.js')

Page({
  data: {
    user: {},
    inputName: '',
    inputAvatar: '',        // 微信头像/相册上传后得到的 cloud://fileID（或临时路径兜底）
    showRegisterModal: false,
    registerCode: '',
    showEditModal: false,
    editName: '',
    editAvatar: '',
    uploadingAvatar: false, // 头像上传中状态
    lastSyncTime: 0
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

  // 从相册/相机上传自定义头像：选图 → 1:1裁剪 → 压缩 → 上传
  chooseFromAlbum: function (e) {
    const source = e.currentTarget.dataset.source || 'input'
    const self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      fail: function () {},
      success: function (res) {
        const tempPath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!tempPath) return
        // 第一步：打开裁剪页，锁定 1:1 比例
        wx.cropImage({
          src: tempPath,
          cropScale: '1:1',
          success: async function (cropRes) {
            const croppedPath = cropRes.tempFilePath
            if (!croppedPath) {
              // 裁剪失败兜底：用原图上传
              self._uploadAndSetAvatar(tempPath, source)
              return
            }
            // 第二步：压缩裁剪后的图片，保证文件不大于 200KB
            self.setData({ uploadingAvatar: true })
            try {
              const compressedPath = await storage.compressImage(croppedPath, 200)
              const user = self.data.user
              const fileID = await storage.uploadAvatarToCloud(compressedPath, user.openid)
              const key = source === 'edit' ? 'editAvatar' : 'inputAvatar'
              self.setData({ [key]: fileID, uploadingAvatar: false })
            } catch (err) {
              console.error('chooseFromAlbum upload failed:', err)
              self.setData({ uploadingAvatar: false })
              wx.showToast({ title: '上传失败，请重试', icon: 'none' })
            }
          },
          fail: function () {
            // 裁剪取消或失败，用原图上传兜底
            self._uploadAndSetAvatar(tempPath, source)
          }
        })
      }
    })
  },

  // 兜底上传（裁剪取消/失败时直接上传原图）
  _uploadAndSetAvatar: function (tempPath, source) {
    const self = this
    self.setData({ uploadingAvatar: true })
    const doUpload = async () => {
      try {
        const user = self.data.user
        const fileID = await storage.uploadAvatarToCloud(tempPath, user.openid)
        const key = source === 'edit' ? 'editAvatar' : 'inputAvatar'
        self.setData({ [key]: fileID, uploadingAvatar: false })
      } catch (err) {
        console.error('_uploadAndSetAvatar failed:', err)
        self.setData({ uploadingAvatar: false })
        wx.showToast({ title: '上传失败，请重试', icon: 'none' })
      }
    }
    doUpload()
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
          avatar: inputAvatar || '',
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

  goFrisbeeVocab: function () {
    wx.navigateTo({
      url: '/pages/frisbee-vocab/frisbee-vocab'
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
          avatar: editAvatar || user.avatar || ''
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
        this.syncToCloud(newUser)
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

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 个人中心',
      path: '/pages/mine/mine',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
