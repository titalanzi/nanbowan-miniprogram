const storage = require('../../utils/storage.js')

Page({
  data: {
    matchName: '',
    matchLocation: '',
    matchDate: '',
    groups: [],
    statTypes: [
      { id: 'stat_score', name: '得分', color: '#22C55E' },
      { id: 'stat_assist', name: '助攻', color: '#3B82F6' },
      { id: 'stat_d', name: 'D盘', color: '#F59E0B' }
    ],
    colorOptions: ['#FF6B35', '#3B82F6', '#22C55E', '#A855F7', '#F59E0B', '#EF4444'],
    
    showGroupModal: false,
    editingGroupIndex: null,
    inputGroupName: '',
    inputGroupColor: '#FF6B35',
    
    showMemberModal: false,
    currentGroupIndex: 0,
    currentGroupMembers: [],
    
    showAddMemberModal: false,
    inputMemberName: '',
    inputMemberGender: 'male',
    
    showStatModal: false,
    inputStatName: '',
    inputStatColor: '#FF6B35'
  },

  onLoad: async function () {
    await this.checkPermission()
    const today = new Date()
    const dateStr = today.getFullYear() + '-' + 
                    (today.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                    today.getDate().toString().padStart(2, '0')
    this.setData({ matchDate: dateStr })
  },

  async checkPermission() {
    const user = await storage.get('user') || {}
    if (!user || !user.id) {
      wx.showModal({
        title: '提示',
        content: '请先注册',
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/mine/mine' })
        }
      })
    }
  },

  onNameInput: function (e) {
    this.setData({ matchName: e.detail.value })
  },

  onLocationInput: function (e) {
    this.setData({ matchLocation: e.detail.value })
  },

  onDateChange: function (e) {
    this.setData({ matchDate: e.detail.value })
  },

  showAddGroupModal: function () {
    this.setData({
      showGroupModal: true,
      editingGroupIndex: null,
      inputGroupName: '',
      inputGroupColor: '#FF6B35'
    })
  },

  editGroup: function (e) {
    const index = e.currentTarget.dataset.index
    const group = this.data.groups[index]
    this.setData({
      showGroupModal: true,
      editingGroupIndex: index,
      inputGroupName: group.name,
      inputGroupColor: group.color
    })
  },

  closeGroupModal: function () {
    this.setData({ showGroupModal: false })
  },

  onGroupNameInput: function (e) {
    this.setData({ inputGroupName: e.detail.value })
  },

  selectGroupColor: function (e) {
    const color = e.currentTarget.dataset.color
    this.setData({ inputGroupColor: color })
  },

  selectStatColor: function (e) {
    const color = e.currentTarget.dataset.color
    this.setData({ inputStatColor: color })
  },

  stopPropagation: function () {
    // 阻止事件冒泡
  },

  saveGroup: function () {
    const { inputGroupName, inputGroupColor, editingGroupIndex, groups } = this.data
    if (!inputGroupName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' })
      return
    }

    let newGroups = [...groups]
    if (editingGroupIndex !== null) {
      newGroups[editingGroupIndex] = {
        ...newGroups[editingGroupIndex],
        name: inputGroupName.trim(),
        color: inputGroupColor
      }
    } else {
      newGroups.push({
        id: 'group_' + Date.now(),
        name: inputGroupName.trim(),
        color: inputGroupColor,
        members: []
      })
    }

    this.setData({ groups: newGroups, showGroupModal: false })
  },

  deleteGroup: function (e) {
    const index = e.currentTarget.dataset.index
    const groups = [...this.data.groups]
    groups.splice(index, 1)
    this.setData({ groups })
  },

  openMemberModal: function (e) {
    const index = e.currentTarget.dataset.index
    const group = this.data.groups[index]
    this.setData({
      showMemberModal: true,
      currentGroupIndex: index,
      currentGroupMembers: group.members ? [...group.members] : []
    })
  },

  closeMemberModal: function () {
    this.setData({ showMemberModal: false })
  },

  showAddMemberModal: function () {
    this.setData({
      showAddMemberModal: true,
      inputMemberName: '',
      inputMemberGender: 'male'
    })
  },

  closeAddMemberModal: function () {
    this.setData({ showAddMemberModal: false })
  },

  onMemberNameInput: function (e) {
    this.setData({ inputMemberName: e.detail.value })
  },

  selectMemberGender: function (e) {
    this.setData({ inputMemberGender: e.currentTarget.dataset.gender })
  },

  saveMember: function () {
    const { inputMemberName, inputMemberGender, currentGroupMembers } = this.data
    if (!inputMemberName.trim()) {
      wx.showToast({ title: '请输入球员姓名', icon: 'none' })
      return
    }

    const newMembers = [...currentGroupMembers]
    newMembers.push({
      id: 'member_' + Date.now(),
      name: inputMemberName.trim(),
      gender: inputMemberGender
    })

    this.setData({
      currentGroupMembers: newMembers,
      showAddMemberModal: false
    })
  },

  deleteMember: function (e) {
    const index = e.currentTarget.dataset.index
    const members = [...this.data.currentGroupMembers]
    members.splice(index, 1)
    this.setData({ currentGroupMembers: members })
  },

  confirmMembers: function () {
    const { currentGroupIndex, currentGroupMembers, groups } = this.data
    const newGroups = [...groups]
    newGroups[currentGroupIndex] = {
      ...newGroups[currentGroupIndex],
      members: currentGroupMembers
    }
    this.setData({
      groups: newGroups,
      showMemberModal: false
    })
  },

  showAddStatModal: function () {
    this.setData({
      showStatModal: true,
      inputStatName: '',
      inputStatColor: '#FF6B35'
    })
  },

  closeStatModal: function () {
    this.setData({ showStatModal: false })
  },

  onStatNameInput: function (e) {
    this.setData({ inputStatName: e.detail.value })
  },

  onStatColorChange: function (e) {
    const index = e.detail.value
    this.setData({ inputStatColor: this.data.colorOptions[index] })
  },

  addStat: function () {
    const { inputStatName, inputStatColor, statTypes } = this.data
    if (!inputStatName.trim()) {
      wx.showToast({ title: '请输入统计项名称', icon: 'none' })
      return
    }

    const newStatTypes = [...statTypes, {
      id: 'stat_' + Date.now(),
      name: inputStatName.trim(),
      color: inputStatColor
    }]

    this.setData({
      statTypes: newStatTypes,
      showStatModal: false
    })
  },

  deleteStat: function (e) {
    const index = e.currentTarget.dataset.index
    if (index < 3) {
      wx.showToast({ title: '默认统计项不能删除', icon: 'none' })
      return
    }

    const statTypes = [...this.data.statTypes]
    statTypes.splice(index, 1)
    this.setData({ statTypes })
  },

  async createMatch() {
    const { matchName, matchLocation, matchDate, groups, statTypes } = this.data

    if (!matchName.trim()) {
      wx.showToast({ title: '请输入比赛名称', icon: 'none' })
      return
    }

    if (groups.length < 2) {
      wx.showToast({ title: '请至少添加2支队伍', icon: 'none' })
      return
    }

    const hasEnoughMembers = groups.every(g => g.members && g.members.length > 0)
    if (!hasEnoughMembers) {
      wx.showToast({ title: '每支队伍至少需要1名球员', icon: 'none' })
      return
    }

    const user = await storage.get('user') || {}

    const match = {
      id: 'match_' + Date.now(),
      name: matchName.trim(),
      status: 'active',
      location: matchLocation.trim() || '',
      date: matchDate,
      groups: groups,
      statTypes: statTypes,
      records: [],
      creatorId: user.id || '',
      creatorName: user.name || '',
      creatorAvatar: user.avatar || '',
      createdAt: new Date().toISOString()
    }

    const matches = await storage.get('matches') || []
    matches.push(match)
    await storage.set('matches', matches)

    this.syncToCloud(match)

    wx.showToast({
      title: '创建成功',
      icon: 'success'
    })

    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/match-record/match-record?id=' + match.id
      })
    }, 1000)
  },

  async syncToCloud(match) {
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        await wx.cloud.callFunction({
          name: 'syncMatch',
          data: { match }
        })
      }
    } catch (e) {
      console.log('Failed to sync match to cloud:', e)
    }
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '福保南波万飞盘 - 创建比赛',
      path: '/pages/create-match/create-match',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
