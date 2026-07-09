const storage = require('../../utils/storage.js')

Page({
  data: {
    matchId: '',
    match: {},
    canEdit: false,
    colorOptions: ['#FF6B35', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#6366F1'],
    showAddGroupModal: false,
    showEditGroupModal: false,
    showAddMemberModal: false,
    editingGroupIndex: null,
    addingMemberToGroupIndex: null,
    newGroupName: '',
    newGroupColor: '#FF6B35',
    editingGroupName: '',
    editingGroupColor: '#FF6B35',
    newMemberName: '',
    newMemberGender: 'male',

    // 成员移动选择状态
    selectedMember: null,
    selectedFromGroup: null,
    selectedFromIndex: null
  },

  onLoad: async function(options) {
    var self = this;
    if (options.id) {
      self.setData({ matchId: options.id });
    }
    await self.checkPermission();
    await self.loadMatch();
  },

  onShow: async function() {
    var self = this;
    await self.checkPermission();
    await self.loadMatch();
  },

  checkPermission: async function() {
    var self = this;
    var user = await storage.get('user') || {};
    var isAssistant = user.role === 'assistant';
    var matchId = self.data.matchId;
    var isCreator = false;
    
    if (matchId) {
      var matches = await storage.get('matches') || [];
      var match = matches.find(function(m) { return m.id === matchId; });
      
      if (!match) {
        const cloudMatches = await storage.getMatchesFromCloudOnly();
        match = cloudMatches.find(m => m.id === matchId);
      }
      
      if (match && match.creatorId === user.id) {
        isCreator = true;
      }
      self.setData({ canEdit: isCreator || isAssistant });
    } else {
      self.setData({ canEdit: isAssistant });
    }
  },

  loadMatch: async function() {
    var self = this;
    var matchId = self.data.matchId;
    if (!matchId) return;
    
    // 优先尝试从本地获取
    var matches = await storage.get('matches') || [];
    var match = matches.find(function(m) { return m.id === matchId; });
    
    // 如果本地没有，从云端获取
    if (!match) {
      console.log('Loading match from cloud...');
      const cloudMatches = await storage.getMatchesFromCloudOnly();
      match = cloudMatches.find(m => m.id === matchId);
    }
    
    if (match) {
      if (!match.records) match.records = [];
      if (!match.groups) match.groups = [];
      self.setData({ match: match });
      // 加载比赛后重新检查权限
      await self.checkPermission();
    }
  },

  saveMatch: function(match) {
    var self = this;
    var matches = storage.get('matches') || [];
    var index = matches.findIndex(function(m) { return m.id === match.id; });
    if (index !== -1) {
      matches[index] = match;
    } else {
      matches.push(match);
    }
    storage.set('matches', matches);
    
    self.syncToCloud(match);
  },

  syncToCloud: function(match) {
    try {
      if (wx.cloud && wx.cloud.callFunction) {
        wx.cloud.callFunction({
          name: 'syncMatch',
          data: { match: match }
        });
      }
    } catch (e) {
      console.log('Failed to sync match to cloud:', e);
    }
  },

  showAddGroupModal: function() {
    this.setData({
      showAddGroupModal: true,
      newGroupName: '',
      newGroupColor: '#FF6B35'
    });
  },

  closeAddGroupModal: function() {
    this.setData({ showAddGroupModal: false });
  },

  onNewGroupNameInput: function(e) {
    this.setData({ newGroupName: e.detail.value });
  },

  selectNewGroupColor: function(e) {
    this.setData({ newGroupColor: e.currentTarget.dataset.color });
  },

  addGroup: function() {
    var self = this;
    var newGroupName = self.data.newGroupName;
    var newGroupColor = self.data.newGroupColor;
    var match = self.data.match;
    
    if (!newGroupName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' });
      return;
    }

    var newGroup = {
      id: 'group_' + Date.now(),
      name: newGroupName.trim(),
      color: newGroupColor,
      members: []
    };

    var newGroups = match.groups.concat([newGroup]);
    var newMatch = {};
    for (var key in match) {
      newMatch[key] = match[key];
    }
    newMatch.groups = newGroups;
    newMatch.updatedAt = new Date().toISOString();
    
    self.setData({ 
      match: newMatch, 
      showAddGroupModal: false 
    });
    self.saveMatch(newMatch);
    
    wx.showToast({ title: '队伍添加成功', icon: 'success' });
  },

  editGroup: function(e) {
    var index = e.currentTarget.dataset.index;
    var group = this.data.match.groups[index];
    this.setData({
      showEditGroupModal: true,
      editingGroupIndex: index,
      editingGroupName: group.name,
      editingGroupColor: group.color
    });
  },

  closeEditGroupModal: function() {
    this.setData({ showEditGroupModal: false });
  },

  onEditingGroupNameInput: function(e) {
    this.setData({ editingGroupName: e.detail.value });
  },

  selectEditingGroupColor: function(e) {
    this.setData({ editingGroupColor: e.currentTarget.dataset.color });
  },

  saveGroupEdit: function() {
    var self = this;
    var editingGroupIndex = self.data.editingGroupIndex;
    var editingGroupName = self.data.editingGroupName;
    var editingGroupColor = self.data.editingGroupColor;
    var match = self.data.match;
    
    if (!editingGroupName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' });
      return;
    }

    var newGroups = [];
    for (var i = 0; i < match.groups.length; i++) {
      newGroups.push(match.groups[i]);
    }
    newGroups[editingGroupIndex] = {
      id: newGroups[editingGroupIndex].id,
      name: editingGroupName.trim(),
      color: editingGroupColor,
      members: newGroups[editingGroupIndex].members
    };

    var newMatch = {};
    for (var key in match) {
      newMatch[key] = match[key];
    }
    newMatch.groups = newGroups;
    newMatch.updatedAt = new Date().toISOString();
    
    self.setData({ 
      match: newMatch, 
      showEditGroupModal: false 
    });
    self.saveMatch(newMatch);
    
    wx.showToast({ title: '队伍修改成功', icon: 'success' });
  },

  deleteGroup: function(e) {
    var self = this;
    var index = e.currentTarget.dataset.index;
    var group = self.data.match.groups[index];

    wx.showModal({
      title: '删除队伍',
      content: '确定要删除队伍"' + group.name + '"吗？',
      success: function(res) {
        if (res.confirm) {
          var newGroups = [];
          for (var i = 0; i < self.data.match.groups.length; i++) {
            if (i !== index) {
              newGroups.push(self.data.match.groups[i]);
            }
          }
          
          var newRecords = [];
          for (var j = 0; j < self.data.match.records.length; j++) {
            if (self.data.match.records[j].groupId !== group.id) {
              newRecords.push(self.data.match.records[j]);
            }
          }
          
          var newMatch = {};
          for (var key in self.data.match) {
            newMatch[key] = self.data.match[key];
          }
          newMatch.groups = newGroups;
          newMatch.records = newRecords;
          newMatch.updatedAt = new Date().toISOString();
          
          self.setData({ match: newMatch });
          self.saveMatch(newMatch);
          
          wx.showToast({ title: '队伍已删除', icon: 'success' });
        }
      }
    });
  },

  showAddMemberModal: function(e) {
    var groupIndex = e.currentTarget.dataset.groupindex;
    this.setData({ 
      showAddMemberModal: true, 
      newMemberName: '',
      newMemberGender: 'male',
      addingMemberToGroupIndex: groupIndex
    });
  },

  closeAddMemberModal: function() {
    this.setData({ showAddMemberModal: false });
  },

  onNewMemberNameInput: function(e) {
    this.setData({ newMemberName: e.detail.value });
  },

  selectNewMemberGender: function(e) {
    this.setData({ newMemberGender: e.currentTarget.dataset.gender });
  },

  addMember: function() {
    var self = this;
    var newMemberName = self.data.newMemberName;
    var newMemberGender = self.data.newMemberGender;
    var addingMemberToGroupIndex = self.data.addingMemberToGroupIndex;
    var match = self.data.match;
    
    if (!newMemberName.trim()) {
      wx.showToast({ title: '请输入成员名称', icon: 'none' });
      return;
    }

    var newGroups = [];
    for (var i = 0; i < match.groups.length; i++) {
      newGroups.push(match.groups[i]);
    }
    
    var newMember = {
      id: 'member_' + Date.now(),
      name: newMemberName.trim(),
      gender: newMemberGender
    };
    
    var newMembers = newGroups[addingMemberToGroupIndex].members.concat([newMember]);
    newGroups[addingMemberToGroupIndex] = {
      id: newGroups[addingMemberToGroupIndex].id,
      name: newGroups[addingMemberToGroupIndex].name,
      color: newGroups[addingMemberToGroupIndex].color,
      members: newMembers
    };

    var newMatch = {};
    for (var key in match) {
      newMatch[key] = match[key];
    }
    newMatch.groups = newGroups;
    newMatch.updatedAt = new Date().toISOString();
    
    self.setData({ 
      match: newMatch, 
      showAddMemberModal: false 
    });
    self.saveMatch(newMatch);
    
    wx.showToast({ title: '成员添加成功', icon: 'success' });
  },

  deleteMember: function(e) {
    var self = this;
    var groupindex = e.currentTarget.dataset.groupindex;
    var memberindex = e.currentTarget.dataset.memberindex;
    var member = self.data.match.groups[groupindex].members[memberindex];

    wx.showModal({
      title: '删除成员',
      content: '确定要删除成员"' + member.name + '"吗？',
      success: function(res) {
        if (res.confirm) {
          var newGroups = [];
          for (var i = 0; i < self.data.match.groups.length; i++) {
            newGroups.push(self.data.match.groups[i]);
          }
          
          var memberId = newGroups[groupindex].members[memberindex].id;

          var newMembers = [];
          for (var j = 0; j < newGroups[groupindex].members.length; j++) {
            if (j !== memberindex) {
              newMembers.push(newGroups[groupindex].members[j]);
            }
          }
          
          newGroups[groupindex] = {
            id: newGroups[groupindex].id,
            name: newGroups[groupindex].name,
            color: newGroups[groupindex].color,
            members: newMembers
          };

          var newRecords = [];
          for (var k = 0; k < self.data.match.records.length; k++) {
            var r = self.data.match.records[k];
            if (!(r.groupId === newGroups[groupindex].id && r.memberId === memberId)) {
              newRecords.push(r);
            }
          }

          var newMatch = {};
          for (var key in self.data.match) {
            newMatch[key] = self.data.match[key];
          }
          newMatch.groups = newGroups;
          newMatch.records = newRecords;
          newMatch.updatedAt = new Date().toISOString();
          
          self.setData({ match: newMatch });
          self.saveMatch(newMatch);
          
          wx.showToast({ title: '成员已删除', icon: 'success' });
        }
      }
    });
  },

  stopPropagation: function() {

  },

  // ========== 成员移动选择 ==========
  selectMember: function (e) {
    const { groupindex, memberindex } = e.currentTarget.dataset
    const { selectedMember, selectedFromGroup, selectedFromIndex, match } = this.data

    if (selectedMember && selectedFromGroup === groupindex && selectedFromIndex === memberindex) {
      // 再次点击同一队员取消选中
      this.setData({
        selectedMember: null,
        selectedFromGroup: null,
        selectedFromIndex: null
      })
    } else {
      const group = match.groups[groupindex]
      const member = group.members[memberindex]
      this.setData({
        selectedMember: member,
        selectedFromGroup: groupindex,
        selectedFromIndex: memberindex
      })
    }
  },

  moveMemberToGroup: function (e) {
    const targetGroupIndex = e.currentTarget.dataset.groupindex
    const { selectedMember, selectedFromGroup, selectedFromIndex, match } = this.data

    if (!selectedMember) {
      wx.showToast({ title: '请先点击选择队员', icon: 'none' })
      return
    }

    if (selectedFromGroup === targetGroupIndex) {
      wx.showToast({ title: '该队员已在此队伍', icon: 'none' })
      return
    }

    var newGroups = match.groups.map(function (g) {
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        members: g.members.slice()
      }
    })

    var movedMember = newGroups[selectedFromGroup].members[selectedFromIndex]
    newGroups[selectedFromGroup].members.splice(selectedFromIndex, 1)
    newGroups[targetGroupIndex].members.push(movedMember)

    var newMatch = {}
    for (var key in match) {
      newMatch[key] = match[key]
    }
    newMatch.groups = newGroups
    newMatch.updatedAt = new Date().toISOString()

    this.setData({
      match: newMatch,
      selectedMember: null,
      selectedFromGroup: null,
      selectedFromIndex: null
    })
    this.saveMatch(newMatch)

    wx.vibrateShort && wx.vibrateShort({ type: 'light' })
    wx.showToast({ title: '已移动到 ' + newGroups[targetGroupIndex].name, icon: 'none' })
  },

  cancelMemberSelection: function () {
    this.setData({
      selectedMember: null,
      selectedFromGroup: null,
      selectedFromIndex: null
    })
  },

  onShareAppMessage: function () {
    const app = getApp()
    return {
      title: '南波万飞盘 - 编辑分组',
      path: `/pages/edit-groups/edit-groups?id=${this.data.matchId}`,
      imageUrl: app.globalData.shareAvatar
    }
  }
})
