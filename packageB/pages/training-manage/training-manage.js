const storage = require('../../../utils/storage.js')
const { checkTrainingPermission } = require('../../../utils/sync-helper.js')

Page({
  data: {
    trainingId: '',
    training: {},
    attendees: [],
    groupedAttendees: [],
    loading: true,
    permission: {},
    // 选中的成员（用于显示底部操作栏）
    selectedUserOpenId: '',
    selectedUserName: '',
    selectedUserAvatar: '',
    selectedGroupId: '',
    selectedIsCoach: false,
    selectedIsCaptain: false,
    showActionSheet: false,
    // 移动分组相关
    showGroupPicker: false,
    // 操作中状态
    processing: false
  },

  onLoad: function (options) {
    if (options.id) {
      this.setData({ trainingId: options.id })
      this.loadDetail()
    } else {
      this.setData({ loading: false })
    }
  },

  onShow: function () {
    if (this.data.trainingId && !this.data.loading) {
      this.loadDetail()
    }
  },

  async loadDetail() {
    const trainingId = this.data.trainingId
    if (!trainingId) return

    wx.showLoading({ title: '加载中...' })

    try {
      const data = await storage.getTrainingDetailFromCloud(trainingId)
      const permission = await checkTrainingPermission(trainingId)

      if (data && data.training) {
        const training = data.training
        const attendees = (data.attendees || []).map(a => ({
          ...a,
          checkInTimeText: this.formatCheckInTime(a.checkInTime)
        }))

        const groupedAttendees = this.groupAttendeesByGroup(attendees, training.groups)
        const captains = Array.isArray(training.captains) ? training.captains : []

        // 给每个 attendee 标记是否为队长
        attendees.forEach(a => {
          a.isCaptain = captains.some(c => c.openid === a.userOpenId)
        })

        this.setData({
          training,
          attendees,
          groupedAttendees: this.groupAttendeesByGroup(attendees, training.groups),
          permission,
          loading: false
        })
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '未找到该队训', icon: 'none' })
      }
    } catch (e) {
      console.error('Load training detail error:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }

    wx.hideLoading()
  },

  groupAttendeesByGroup(attendees, groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
      return [{
        groupName: '全部成员',
        groupId: '',
        attendees: attendees
      }]
    }

    const groupMap = {}
    groups.forEach(g => {
      groupMap[g.id] = {
        groupName: g.name,
        groupId: g.id,
        attendees: []
      }
    })

    let unassignedAttendees = []

    attendees.forEach(a => {
      if (a.groupId && groupMap[a.groupId]) {
        groupMap[a.groupId].attendees.push(a)
      } else {
        unassignedAttendees.push(a)
      }
    })

    const result = Object.values(groupMap)
    result.sort((a, b) => {
      const indexA = groups.findIndex(g => g.id === a.groupId)
      const indexB = groups.findIndex(g => g.id === b.groupId)
      return indexA - indexB
    })

    if (unassignedAttendees.length > 0) {
      result.push({
        groupName: '未分配',
        groupId: '_unassigned',
        attendees: unassignedAttendees
      })
    }

    return result
  },

  formatCheckInTime(timeStr) {
    if (!timeStr) return ''
    try {
      const d = new Date(timeStr)
      if (isNaN(d.getTime())) return timeStr
      const pad = n => (n < 10 ? '0' + n : '' + n)
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    } catch (e) {
      return timeStr
    }
  },

  // 点击成员，选中并显示操作栏
  onAttendeeTap(e) {
    const { openid, name, avatar, groupId, isCoach, isCaptain } = e.currentTarget.dataset
    this.setData({
      selectedUserOpenId: openid,
      selectedUserName: name || '匿名队员',
      selectedUserAvatar: avatar || '',
      selectedGroupId: groupId || '',
      selectedIsCoach: !!isCoach,
      selectedIsCaptain: !!isCaptain,
      showActionSheet: true
    })
  },

  // 关闭操作栏
  closeActionSheet() {
    this.setData({ showActionSheet: false })
  },

  noop() {},

  // 打开分组选择器
  openGroupPicker() {
    this.setData({ showGroupPicker: true })
  },

  // 关闭分组选择器
  closeGroupPicker() {
    this.setData({ showGroupPicker: false })
  },

  // 选择目标分组
  onGroupSelect(e) {
    const targetGroupId = e.currentTarget.dataset.groupId
    const finalGroupId = targetGroupId === '_unassigned' ? '' : targetGroupId
    this.setData({ showGroupPicker: false })
    this.doMoveGroup(finalGroupId)
  },

  // 移动到其他分组
  async doMoveGroup(targetGroupId) {
    const { selectedUserOpenId, selectedUserName, trainingId } = this.data
    if (!selectedUserOpenId) return

    if (targetGroupId === this.data.selectedGroupId) {
      wx.showToast({ title: '已在当前分组', icon: 'none' })
      return
    }

    this.setData({ processing: true })
    wx.showLoading({ title: '移动中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'updateAttendeeGroup',
        data: {
          trainingId,
          userOpenId: selectedUserOpenId,
          groupId: targetGroupId
        }
      })
      wx.hideLoading()
      const result = res && res.result
      if (result && result.success) {
        const title = result.wasCaptain ? '已移动分组，队长身份已取消' : '已移动分组'
        wx.showToast({ title, icon: 'success' })
        this.setData({ showActionSheet: false, processing: false })
        this.loadDetail()
      } else {
        this.setData({ processing: false })
        wx.showToast({ title: (result && result.error) || '移动失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      this.setData({ processing: false })
      console.error('Move group error:', err)
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  // 设置为队长
  async doSetCaptain() {
    const { selectedUserOpenId, selectedUserName, selectedGroupId, trainingId, selectedIsCaptain } = this.data
    if (!selectedUserOpenId) return

    // 如果已经是队长，改为取消队长
    if (selectedIsCaptain) {
      this.doCancelCaptain()
      return
    }

    if (!selectedGroupId || selectedGroupId === '_unassigned') {
      wx.showToast({ title: '请先将成员分配到分组', icon: 'none' })
      return
    }

    wx.showModal({
      title: '设置队长',
      content: `确定要设置「${selectedUserName}」为该分组队长吗？`,
      confirmText: '设置',
      success: async (res) => {
        if (!res.confirm) return

        this.setData({ processing: true })
        wx.showLoading({ title: '处理中...' })

        try {
          const result = await wx.cloud.callFunction({
            name: 'setCaptain',
            data: {
              trainingId,
              userOpenId: selectedUserOpenId,
              groupId: selectedGroupId
            }
          })
          wx.hideLoading()

          if (result.result && result.result.success) {
            wx.showToast({ title: '队长已设置', icon: 'success' })
            this.setData({ showActionSheet: false, processing: false })
            this.loadDetail()
          } else {
            this.setData({ processing: false })
            wx.showToast({ title: (result.result && result.result.error) || '设置失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          this.setData({ processing: false })
          console.error('Set captain error:', err)
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      }
    })
  },

  // 取消队长
  async doCancelCaptain() {
    const { selectedUserOpenId, selectedUserName, trainingId } = this.data
    if (!selectedUserOpenId) return

    wx.showModal({
      title: '取消队长',
      content: `确定要取消「${selectedUserName}」的队长身份吗？`,
      confirmText: '取消',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return

        this.setData({ processing: true })
        wx.showLoading({ title: '处理中...' })

        try {
          const result = await wx.cloud.callFunction({
            name: 'cancelCaptain',
            data: {
              trainingId,
              userOpenId: selectedUserOpenId
            }
          })
          wx.hideLoading()

          if (result.result && result.result.success) {
            wx.showToast({ title: '已取消队长', icon: 'success' })
            this.setData({ showActionSheet: false, processing: false })
            this.loadDetail()
          } else {
            this.setData({ processing: false })
            wx.showToast({ title: (result.result && result.result.error) || '取消失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          this.setData({ processing: false })
          console.error('Cancel captain error:', err)
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      }
    })
  },

  // 移除教练身份
  async doRemoveCoachRole() {
    const { selectedUserOpenId, selectedUserName, trainingId } = this.data

    wx.showModal({
      title: '移除教练身份',
      content: `确定要移除「${selectedUserName}」的教练身份吗？移除后将变为普通队员。`,
      confirmText: '移除',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return

        this.setData({ processing: true })
        wx.showLoading({ title: '处理中...' })

        try {
          const result = await wx.cloud.callFunction({
            name: 'removeCoachRole',
            data: {
              trainingId,
              userOpenId: selectedUserOpenId
            }
          })
          wx.hideLoading()

          if (result.result && result.result.success) {
            wx.showToast({ title: '已移除教练身份', icon: 'success' })
            this.setData({ showActionSheet: false, processing: false })
            this.loadDetail()
          } else {
            this.setData({ processing: false })
            wx.showToast({ title: (result.result && result.result.error) || '移除失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          this.setData({ processing: false })
          console.error('Remove coach role error:', err)
          wx.showToast({ title: '网络错误', icon: 'none' })
        }
      }
    })
  },

  // 移除成员
  async doRemoveAttendee() {
    const { selectedUserOpenId, selectedUserName, trainingId } = this.data

    wx.showModal({
      title: '移除成员',
      content: `确定要将「${selectedUserName}」移出本次队训吗？`,
      confirmText: '移除',
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return

        this.setData({ processing: true })
        wx.showLoading({ title: '处理中...' })

        let cloudSuccess = false
        try {
          if (wx.cloud && wx.cloud.callFunction) {
            const result = await wx.cloud.callFunction({
              name: 'removeTrainingAttendee',
              data: {
                trainingId,
                userOpenId: selectedUserOpenId
              }
            })
            if (result.result && result.result.success) {
              cloudSuccess = true
            }
          }
        } catch (err) {
          console.error('Remove attendee cloud error:', err)
        }

        wx.hideLoading()

        if (cloudSuccess) {
          wx.showToast({ title: '已移除', icon: 'success' })
        } else {
          wx.showToast({ title: '移除失败', icon: 'none' })
        }
        
        this.setData({ showActionSheet: false, processing: false })
        this.loadDetail()
      }
    })
  }
})