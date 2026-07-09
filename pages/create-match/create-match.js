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
      { id: 'stat_d', name: 'D盘', color: '#F59E0B' },
      { id: 'stat_turnover', name: '烂盘', color: '#EF4444' }
    ],
    colorOptions: ['#FF6B35', '#3B82F6', '#22C55E', '#A855F7', '#F59E0B', '#EF4444'],
    
    // 分组模式
    groupMode: 'manual',
    
    // 随机分配模式
    randomStep: 1,
    allPlayers: [],
    randomGroups: [],
    editingRandomGroupIndex: null,
    showGroupConfigModal: false,
    groupConfigName: '',
    groupConfigColor: '#FF6B35',
    groupConfigCaptainId: '',
    groupConfigFixedIds: [],
    showPlayerPicker: false,
    pickerMode: 'captain',
    assignedGroups: [],
    isShuffling: false,

    // 点击选择调整状态
    selectedMember: null,
    selectedFromGroup: null,
    selectedFromIndex: null,
    
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
    if (index < 4) {
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

  // ========== 随机分配模式 - 基础方法 ==========
  switchGroupMode: function (e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ groupMode: mode })
  },

  // ========== Step 1: 录入参赛队员 ==========
  showAddPlayerModal: function () {
    this.setData({
      showAddPlayerModal: true,
      inputPlayerName: '',
      inputPlayerGender: 'male'
    })
  },

  closeAddPlayerModal: function () {
    this.setData({ showAddPlayerModal: false })
  },

  onPlayerNameInput: function (e) {
    this.setData({ inputPlayerName: e.detail.value })
  },

  selectPlayerGender: function (e) {
    this.setData({ inputPlayerGender: e.currentTarget.dataset.gender })
  },

  addPlayer: function () {
    const { inputPlayerName, inputPlayerGender, allPlayers } = this.data
    if (!inputPlayerName.trim()) {
      wx.showToast({ title: '请输入队员姓名', icon: 'none' })
      return
    }
    const newPlayer = {
      id: 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: inputPlayerName.trim(),
      gender: inputPlayerGender
    }
    const newPlayers = [newPlayer, ...allPlayers]
    this.setData({
      allPlayers: newPlayers,
      showAddPlayerModal: false
    })
    this.updatePlayerStats()
  },

  removePlayer: function (e) {
    const index = e.currentTarget.dataset.index
    const allPlayers = [...this.data.allPlayers]
    allPlayers.splice(index, 1)
    this.setData({ allPlayers })
    this.updatePlayerStats()
  },

  updatePlayerStats: function () {
    const { allPlayers } = this.data
    const maleCount = allPlayers.filter(p => p.gender === 'male').length
    const femaleCount = allPlayers.filter(p => p.gender === 'female').length
    this.setData({ maleCount, femaleCount })
  },

  gotoRandomStep2: function () {
    if (this.data.allPlayers.length < 4) {
      wx.showToast({ title: '至少需要4名队员', icon: 'none' })
      return
    }
    this.setData({ randomStep: 2 })
  },

  gotoRandomStep1: function () {
    this.setData({ randomStep: 1 })
  },

  // ========== Step 2: 创建队伍 & 配置 ==========
  addRandomGroup: function () {
    this.setData({
      showGroupConfigModal: true,
      editingRandomGroupIndex: null,
      groupConfigName: '',
      groupConfigColor: this.data.colorOptions[this.data.randomGroups.length % this.data.colorOptions.length],
      groupConfigCaptainId: '',
      groupConfigCaptainName: '',
      groupConfigFixedIds: [],
      groupConfigFixedNames: []
    })
  },

  editRandomGroup: function (e) {
    const index = e.currentTarget.dataset.index
    const group = this.data.randomGroups[index]
    this.setData({
      showGroupConfigModal: true,
      editingRandomGroupIndex: index,
      groupConfigName: group.name,
      groupConfigColor: group.color,
      groupConfigCaptainId: group.captainId || '',
      groupConfigCaptainName: group.captainName || '',
      groupConfigFixedIds: [...(group.fixedMemberIds || [])],
      groupConfigFixedNames: [...(group.fixedNames || [])]
    })
  },

  deleteRandomGroup: function (e) {
    const index = e.currentTarget.dataset.index
    const self = this
    wx.showModal({
      title: '删除队伍',
      content: '确定删除该队伍吗？',
      success: function (res) {
        if (res.confirm) {
          const randomGroups = [...self.data.randomGroups]
          randomGroups.splice(index, 1)
          self.setData({ randomGroups })
          self.updateRandomGroupStats()
        }
      }
    })
  },

  closeGroupConfigModal: function () {
    this.setData({ showGroupConfigModal: false })
  },

  onGroupNameConfigInput: function (e) {
    this.setData({ groupConfigName: e.detail.value })
  },

  selectGroupConfigColor: function (e) {
    this.setData({ groupConfigColor: e.currentTarget.dataset.color })
  },

  saveGroupConfig: function () {
    const { groupConfigName, groupConfigColor, groupConfigCaptainId, editingRandomGroupIndex, randomGroups, allPlayers } = this.data
    if (!groupConfigName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' })
      return
    }
    if (!groupConfigCaptainId) {
      wx.showToast({ title: '请选择队长', icon: 'none' })
      return
    }

    const captain = allPlayers.find(p => p.id === groupConfigCaptainId)
    const fixedIds = this.data.groupConfigFixedIds || []
    const fixedNames = fixedIds.map(id => {
      const p = allPlayers.find(pl => pl.id === id)
      return p ? p.name : ''
    }).filter(n => n)

    const memberCount = 1 + fixedIds.length

    const newGroups = [...randomGroups]
    const groupData = {
      id: editingRandomGroupIndex !== null ? newGroups[editingRandomGroupIndex].id : 'group_' + Date.now(),
      name: groupConfigName.trim(),
      color: groupConfigColor,
      captainId: groupConfigCaptainId,
      captainName: captain ? captain.name : '',
      fixedMemberIds: fixedIds,
      fixedNames: fixedNames,
      memberCount: memberCount
    }

    if (editingRandomGroupIndex !== null) {
      newGroups[editingRandomGroupIndex] = groupData
    } else {
      newGroups.push(groupData)
    }

    this.setData({
      randomGroups: newGroups,
      showGroupConfigModal: false
    })
    this.updateRandomGroupStats()
  },

  updateRandomGroupStats: function () {
    const { randomGroups, allPlayers } = this.data
    const allCaptains = randomGroups.map(g => g.captainId).filter(Boolean)
    const allFixed = randomGroups.reduce((acc, g) => acc.concat(g.fixedMemberIds || []), [])
    const usedIds = [...new Set([...allCaptains, ...allFixed])]
    const remainingCount = allPlayers.length - usedIds.length
    const canStartRandom = randomGroups.length >= 2 && randomGroups.every(g => g.captainId)
    this.setData({ canStartRandom, remainingCount })
  },

  // ========== 队员选择器 ==========
  openPlayerPicker: function (e) {
    const mode = e.currentTarget.dataset.mode
    const { allPlayers, randomGroups, editingRandomGroupIndex, groupConfigCaptainId, groupConfigFixedIds } = this.data

    const otherGroups = randomGroups.filter((_, i) => i !== editingRandomGroupIndex)
    const usedByOthers = []
    otherGroups.forEach(g => {
      if (g.captainId) usedByOthers.push(g.captainId)
      if (g.fixedMemberIds) usedByOthers.push(...g.fixedMemberIds)
    })

    let selectedIds = []
    if (mode === 'captain') {
      if (groupConfigCaptainId) selectedIds = [groupConfigCaptainId]
    } else {
      selectedIds = [...(groupConfigFixedIds || [])]
      if (groupConfigCaptainId && selectedIds.indexOf(groupConfigCaptainId) === -1) {
        selectedIds.push(groupConfigCaptainId)
      }
    }

    const availablePlayers = allPlayers.map(p => ({
      ...p,
      disabled: usedByOthers.indexOf(p.id) > -1,
      isSelected: selectedIds.indexOf(p.id) > -1
    }))

    this.setData({
      showPlayerPicker: true,
      pickerMode: mode,
      availablePlayers,
      pickerSelectedIds: selectedIds
    })
  },

  closePlayerPicker: function () {
    this.setData({ showPlayerPicker: false })
  },

  togglePlayerSelect: function (e) {
    const { id, disabled } = e.currentTarget.dataset
    if (disabled) return

    const { pickerMode, pickerSelectedIds, availablePlayers } = this.data
    let newSelected = [...pickerSelectedIds]

    if (pickerMode === 'captain') {
      newSelected = newSelected.indexOf(id) > -1 ? [] : [id]
    } else {
      const idx = newSelected.indexOf(id)
      if (idx > -1) {
        newSelected.splice(idx, 1)
      } else {
        newSelected.push(id)
      }
    }

    const newAvailablePlayers = availablePlayers.map(p => ({
      ...p,
      isSelected: newSelected.indexOf(p.id) > -1
    }))

    this.setData({
      pickerSelectedIds: newSelected,
      availablePlayers: newAvailablePlayers
    })
  },

  confirmPlayerPicker: function () {
    const { pickerMode, pickerSelectedIds, allPlayers } = this.data
    const selectedNames = pickerSelectedIds.map(id => {
      const p = allPlayers.find(pl => pl.id === id)
      return p ? p.name : ''
    }).filter(n => n)

    if (pickerMode === 'captain') {
      if (pickerSelectedIds.length === 0) {
        wx.showToast({ title: '请选择队长', icon: 'none' })
        return
      }
      this.setData({
        groupConfigCaptainId: pickerSelectedIds[0],
        groupConfigCaptainName: selectedNames[0]
      })
    } else {
      const captainId = this.data.groupConfigCaptainId
      const fixedIds = pickerSelectedIds.filter(id => id !== captainId)
      const fixedNames = fixedIds.map(id => {
        const p = allPlayers.find(pl => pl.id === id)
        return p ? p.name : ''
      }).filter(n => n)
      this.setData({
        groupConfigFixedIds: fixedIds,
        groupConfigFixedNames: fixedNames
      })
    }

    this.setData({ showPlayerPicker: false })
  },

  // ========== Step 3: 随机分配 ==========
  performRandomAssign: function () {
    const { randomGroups, allPlayers, canStartRandom } = this.data
    if (!canStartRandom) {
      wx.showToast({ title: '请先完成队伍配置', icon: 'none' })
      return
    }

    const malePlayers = allPlayers.filter(p => p.gender === 'male')
    const femalePlayers = allPlayers.filter(p => p.gender === 'female')

    const assignedGroups = randomGroups.map(g => ({
      id: g.id,
      name: g.name,
      color: g.color,
      members: []
    }))

    // 1. 先放入队长和固定队员
    const usedIds = []
    randomGroups.forEach((g, i) => {
      const captain = allPlayers.find(p => p.id === g.captainId)
      if (captain) {
        assignedGroups[i].members.push({ ...captain, isCaptain: true, isFixed: true })
        usedIds.push(captain.id)
      }
      if (g.fixedMemberIds) {
        g.fixedMemberIds.forEach(fid => {
          if (usedIds.indexOf(fid) === -1) {
            const fp = allPlayers.find(p => p.id === fid)
            if (fp) {
              assignedGroups[i].members.push({ ...fp, isCaptain: false, isFixed: true })
              usedIds.push(fid)
            }
          }
        })
      }
    })

    // 2. 计算每队已有男女数，剩余需要分配的男女总数
    const remainingMale = malePlayers.filter(p => usedIds.indexOf(p.id) === -1)
    const remainingFemale = femalePlayers.filter(p => usedIds.indexOf(p.id) === -1)

    const groupCount = assignedGroups.length
    const totalMale = malePlayers.length
    const totalFemale = femalePlayers.length

    // 每队应分到的目标男女数（包括队长/固定队员），尽量平均
    const targetMalePerGroup = Math.floor(totalMale / groupCount)
    const targetFemalePerGroup = Math.floor(totalFemale / groupCount)
    const extraMaleCount = totalMale % groupCount
    const extraFemaleCount = totalFemale % groupCount

    // 每队还需补充的男女人数 = 目标数 - 已有数
    const maleNeeds = []
    const femaleNeeds = []
    for (let i = 0; i < groupCount; i++) {
      const curMale = assignedGroups[i].members.filter(m => m.gender === 'male').length
      const curFemale = assignedGroups[i].members.filter(m => m.gender === 'female').length
      maleNeeds.push(Math.max(0, targetMalePerGroup - curMale))
      femaleNeeds.push(Math.max(0, targetFemalePerGroup - curFemale))
    }

    // 洗牌剩余队员
    const shuffledMale = this.shuffleArray([...remainingMale])
    const shuffledFemale = this.shuffleArray([...remainingFemale])

    // 3. 先按需分配男生
    let maleIdx = 0
    for (let i = 0; i < groupCount && maleIdx < shuffledMale.length; i++) {
      for (let j = 0; j < maleNeeds[i] && maleIdx < shuffledMale.length; j++) {
        assignedGroups[i].members.push({ ...shuffledMale[maleIdx], isCaptain: false, isFixed: false })
        maleIdx++
      }
    }

    // 4. 先按需分配女生
    let femaleIdx = 0
    for (let i = 0; i < groupCount && femaleIdx < shuffledFemale.length; i++) {
      for (let j = 0; j < femaleNeeds[i] && femaleIdx < shuffledFemale.length; j++) {
        assignedGroups[i].members.push({ ...shuffledFemale[femaleIdx], isCaptain: false, isFixed: false })
        femaleIdx++
      }
    }

    // 5. 分配余数男生到随机队伍（每队最多多1个）
    const extraMaleIndices = this.shuffleArray([...Array(groupCount).keys()]).slice(0, extraMaleCount)
    extraMaleIndices.forEach(i => {
      if (maleIdx < shuffledMale.length) {
        assignedGroups[i].members.push({ ...shuffledMale[maleIdx], isCaptain: false, isFixed: false })
        maleIdx++
      }
    })

    // 6. 分配余数女生到随机队伍（每队最多多1个）
    const extraFemaleIndices = this.shuffleArray([...Array(groupCount).keys()]).slice(0, extraFemaleCount)
    extraFemaleIndices.forEach(i => {
      if (femaleIdx < shuffledFemale.length) {
        assignedGroups[i].members.push({ ...shuffledFemale[femaleIdx], isCaptain: false, isFixed: false })
        femaleIdx++
      }
    })

    // 7. 如果还有剩余（队长/固定分布不均导致需求数不够），随机分配
    const randomExtraIndices = this.shuffleArray([...Array(groupCount).keys()])
    let extraPtr = 0
    while (maleIdx < shuffledMale.length) {
      assignedGroups[randomExtraIndices[extraPtr % groupCount]].members.push({ ...shuffledMale[maleIdx], isCaptain: false, isFixed: false })
      maleIdx++
      extraPtr++
    }
    extraPtr = 0
    while (femaleIdx < shuffledFemale.length) {
      assignedGroups[randomExtraIndices[extraPtr % groupCount]].members.push({ ...shuffledFemale[femaleIdx], isCaptain: false, isFixed: false })
      femaleIdx++
      extraPtr++
    }

    assignedGroups.forEach(g => {
      g.maleCount = g.members.filter(m => m.gender === 'male').length
      g.femaleCount = g.members.filter(m => m.gender === 'female').length
    })

    this.setData({
      assignedGroups,
      randomStep: 3,
      isShuffling: false
    })
  },

  shuffleArray: function (arr) {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  },

  reRandom: function () {
    this.setData({ isShuffling: true })
    setTimeout(() => {
      this.performRandomAssign()
    }, 500)
  },

  gotoRandomStep4: function () {
    this.setData({ randomStep: 4 })
  },

  gotoRandomStep3: function () {
    this.setData({ randomStep: 3 })
  },

  gotoRandomStep2FromResult: function () {
    this.setData({ randomStep: 2 })
  },

  // ========== Step 4: 点击调整 ==========
  selectMember: function (e) {
    const { groupIndex, memberIndex } = e.currentTarget.dataset
    const { selectedMember, selectedFromGroup, selectedFromIndex } = this.data

    if (selectedMember && selectedFromGroup === groupIndex && selectedFromIndex === memberIndex) {
      this.setData({
        selectedMember: null,
        selectedFromGroup: null,
        selectedFromIndex: null
      })
    } else {
      const group = this.data.assignedGroups[groupIndex]
      const member = group.members[memberIndex]
      this.setData({
        selectedMember: member,
        selectedFromGroup: groupIndex,
        selectedFromIndex: memberIndex
      })
    }
  },

  moveMemberToGroup: function (e) {
    const targetGroupIndex = e.currentTarget.dataset.groupIndex
    const { selectedMember, selectedFromGroup, selectedFromIndex, assignedGroups } = this.data

    if (!selectedMember) {
      wx.showToast({ title: '请先点击选择队员', icon: 'none' })
      return
    }

    if (selectedFromGroup === targetGroupIndex) {
      wx.showToast({ title: '该队员已在此队伍', icon: 'none' })
      return
    }

    const newGroups = assignedGroups.map(g => ({ ...g, members: [...g.members] }))
    const [movedMember] = newGroups[selectedFromGroup].members.splice(selectedFromIndex, 1)
    if (movedMember.isCaptain) {
      movedMember.isCaptain = false
      movedMember.isFixed = false
    } else if (movedMember.isFixed) {
      movedMember.isFixed = false
    }
    newGroups[targetGroupIndex].members.push(movedMember)

    newGroups.forEach(g => {
      g.maleCount = g.members.filter(m => m.gender === 'male').length
      g.femaleCount = g.members.filter(m => m.gender === 'female').length
    })

    this.setData({
      assignedGroups: newGroups,
      selectedMember: null,
      selectedFromGroup: null,
      selectedFromIndex: null
    })
    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
  },

  cancelSelection: function () {
    this.setData({
      selectedMember: null,
      selectedFromGroup: null,
      selectedFromIndex: null
    })
  },

  // ========== 完成分配 ==========
  confirmRandomAssignment: function () {
    const { assignedGroups } = this.data
    if (assignedGroups.length < 2) {
      wx.showToast({ title: '至少需要2支队伍', icon: 'none' })
      return
    }

    const groups = assignedGroups.map(g => ({
      id: g.id,
      name: g.name,
      color: g.color,
      members: g.members.map(m => ({
        id: m.id,
        name: m.name,
        gender: m.gender,
        isCaptain: m.isCaptain || false,
        isFixed: m.isFixed || false
      }))
    }))

    this.setData({
      groups,
      groupMode: 'manual'
    })

    wx.showToast({ title: '分配完成', icon: 'success' })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 创建比赛',
      path: '/pages/create-match/create-match',
      imageUrl: app.globalData.shareAvatar
    }
  }
})
