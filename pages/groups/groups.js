const storage = require('../../utils/storage.js')

Page({
  data: {
    groups: [],
    members: [],
    showAddModal: false,
    showMemberModal: false,
    showMemberDetail: false,
    newGroupName: '',
    newGroupColor: '#FF6B35',
    editingGroupId: null,
    selectedGroup: null,
    groupMembers: [],
    newMemberName: '',
    editingMemberId: null,
    selectedMember: null,
    colorOptions: [
      '#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#00ACC1'
    ]
  },

  onLoad: function () {
    this.loadData()
  },

  onShow: function () {
    this.loadData()
  },

  loadData: function () {
    const groups = storage.get('groups') || []
    const members = storage.get('members') || []
    this.setData({ groups, members })
  },

  showAddGroupModal: function () {
    this.setData({
      showAddModal: true,
      newGroupName: '',
      newGroupColor: '#FF6B35',
      editingGroupId: null
    })
  },

  closeAddModal: function () {
    this.setData({ showAddModal: false })
  },

  saveGroup: function () {
    const { newGroupName, editingGroupId, newGroupColor } = this.data
    if (!newGroupName.trim()) {
      wx.showToast({ title: '请输入分组名称', icon: 'none' })
      return
    }

    let groups = storage.get('groups') || []
    if (editingGroupId) {
      groups = groups.map(g => 
        g.id === editingGroupId 
          ? { ...g, name: newGroupName.trim(), color: newGroupColor } 
          : g
      )
    } else {
      groups.push({
        id: 'group_' + Date.now(),
        name: newGroupName.trim(),
        color: newGroupColor,
        createdAt: new Date().toISOString().split('T')[0]
      })
    }
    storage.set('groups', groups)
    this.loadData()
    this.closeAddModal()
    wx.showToast({ title: editingGroupId ? '修改成功' : '创建成功', icon: 'success' })
  },

  editGroup: function (e) {
    const group = e.currentTarget.dataset.group
    this.setData({
      showAddModal: true,
      newGroupName: group.name,
      newGroupColor: group.color,
      editingGroupId: group.id
    })
  },

  deleteGroup: function (e) {
    const groupId = e.currentTarget.dataset.id
    const members = storage.get('members') || []
    const groupMembers = members.filter(m => m.groupId === groupId)
    
    if (groupMembers.length > 0) {
      wx.showModal({
        title: '提示',
        content: `该分组下有 ${groupMembers.length} 名成员，删除后成员也会被删除，确定删除吗？`,
        success: (res) => {
          if (res.confirm) {
            this.confirmDeleteGroup(groupId)
          }
        }
      })
    } else {
      wx.showModal({
        title: '提示',
        content: '确定删除该分组吗？',
        success: (res) => {
          if (res.confirm) {
            this.confirmDeleteGroup(groupId)
          }
        }
      })
    }
  },

  confirmDeleteGroup: function (groupId) {
    let groups = storage.get('groups') || []
    let members = storage.get('members') || []
    
    groups = groups.filter(g => g.id !== groupId)
    members = members.filter(m => m.groupId !== groupId)
    
    storage.set('groups', groups)
    storage.set('members', members)
    this.loadData()
    wx.showToast({ title: '删除成功', icon: 'success' })
  },

  selectColor: function (e) {
    this.setData({ newGroupColor: e.currentTarget.dataset.color })
  },

  viewGroupMembers: function (e) {
    const group = e.currentTarget.dataset.group
    const members = storage.get('members') || []
    const groupMembers = members.filter(m => m.groupId === group.id)
    this.setData({
      showMemberModal: true,
      selectedGroup: group,
      groupMembers
    })
  },

  closeMemberModal: function () {
    this.setData({ showMemberModal: false, selectedGroup: null })
  },

  showAddMemberModal: function () {
    this.setData({
      showMemberDetail: true,
      newMemberName: '',
      editingMemberId: null,
      selectedMember: null
    })
  },

  closeMemberDetail: function () {
    this.setData({ showMemberDetail: false, selectedMember: null })
  },

  editMember: function (e) {
    const member = e.currentTarget.dataset.member
    this.setData({
      showMemberDetail: true,
      newMemberName: member.name,
      editingMemberId: member.id,
      selectedMember: member
    })
  },

  saveMember: function () {
    const { newMemberName, editingMemberId, selectedGroup } = this.data
    if (!newMemberName.trim()) {
      wx.showToast({ title: '请输入成员姓名', icon: 'none' })
      return
    }

    let members = storage.get('members') || []
    if (editingMemberId) {
      members = members.map(m =>
        m.id === editingMemberId
          ? { ...m, name: newMemberName.trim() }
          : m
      )
    } else {
      members.push({
        id: 'member_' + Date.now(),
        name: newMemberName.trim(),
        groupId: selectedGroup.id
      })
    }
    storage.set('members', members)
    
    const groupMembers = members.filter(m => m.groupId === selectedGroup.id)
    this.setData({ groupMembers })
    this.closeMemberDetail()
    wx.showToast({ title: editingMemberId ? '修改成功' : '添加成功', icon: 'success' })
  },

  deleteMember: function (e) {
    const memberId = e.currentTarget.dataset.id
    const groupId = this.data.selectedGroup.id
    
    wx.showModal({
      title: '提示',
      content: '确定删除该成员吗？',
      success: (res) => {
        if (res.confirm) {
          let members = storage.get('members') || []
          members = members.filter(m => m.id !== memberId)
          storage.set('members', members)
          
          const groupMembers = members.filter(m => m.groupId === groupId)
          this.setData({ groupMembers })
          wx.showToast({ title: '删除成功', icon: 'success' })
        }
      }
    })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 分组管理',
      path: '/pages/groups/groups',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
