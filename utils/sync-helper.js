const storage = require('./storage.js')
const config = require('./config.js')

/**
 * 通用工具函数，供多个页面复用
 */

// 从云端同步用户信息，返回合并后的用户对象
async function syncUserFromCloud() {
  const user = storage.get('user') || {}
  if (!user.id) {
    return user
  }

  try {
    if (storage.isCloudAvailable()) {
      const cloudUser = await storage.getUserFromCloud()

      if (cloudUser) {
        const mergedUser = {
          ...user,
          name: cloudUser.name || user.name,
          avatar: cloudUser.avatar || user.avatar,
          role: cloudUser.role || user.role,
          registered: true
        }

        if (JSON.stringify(mergedUser) !== JSON.stringify(user)) {
          storage.setLocal('user', mergedUser)
          return mergedUser
        }
      }
    }
  } catch (e) {
    console.log('Sync user from cloud failed:', e)
  }
  return user
}

// 计算分组统计数据（O(n) 时间，避免嵌套循环）
function calculateGroupStats(match) {
  if (!match || !match.groups || !match.records) {
    return []
  }

  // 先将 records 按 groupId 分组索引
  const recordsByGroup = {}
  for (const record of match.records) {
    if (!recordsByGroup[record.groupId]) {
      recordsByGroup[record.groupId] = []
    }
    recordsByGroup[record.groupId].push(record)
  }

  return match.groups.map(group => {
    const groupRecords = recordsByGroup[group.id] || []
    let score = 0, assist = 0, dDisc = 0, turnover = 0
    for (const record of groupRecords) {
      if (record.statType === 'stat_score') score++
      else if (record.statType === 'stat_assist') assist++
      else if (record.statType === 'stat_d') dDisc++
      else if (record.statType === 'stat_turnover') turnover++
    }
    return {
      groupId: group.id,
      groupName: group.name,
      color: group.color,
      score,
      assist,
      dDisc,
      turnover
    }
  })
}

// 从云端检查用户是否有编辑该比赛的权限，返回 { isCreator, isAssistant, canEdit }
async function checkPermissionFromCloud(matchId) {
  const user = storage.get('user') || {}
  const isAssistant = user.role === 'assistant'

  if (!matchId || !user.id) {
    return { isCreator: false, isAssistant, canEdit: isAssistant }
  }

  // 优先从云端获取比赛数据进行权限检查
  const cloudMatches = await storage.getMatchesFromCloudOnly()
  let match = cloudMatches.find(m => m.id === matchId)

  // 如果云端没有，再从本地获取
  if (!match) {
    const matches = storage.get('matches') || []
    match = matches.find(m => m.id === matchId)
  }

  const isCreator = match && match.creatorId === user.id
  return {
    isCreator,
    isAssistant,
    canEdit: isCreator || isAssistant
  }
}

// 验证助理码：优先云端验证，本地配置备用
async function verifyAssistantCode(code) {
  if (!code) return false

  // 1. 优先调用云端验证
  try {
    if (storage.isCloudAvailable()) {
      const result = await storage.callCloudFunction('verifyAssistantCode', { code })
      if (result && result.success) {
        return true
      }
    }
  } catch (e) {
    console.log('Cloud assistant code verification failed, trying local:', e)
  }

  // 2. 云端不可用时，使用本地备用码
  return config.DEFAULT_ASSISTANT_CODES.indexOf(code) !== -1
}

// 检查队训权限：创建者或教练或助理可编辑
async function checkTrainingPermission(trainingId) {
  try {
    if (storage.isCloudAvailable()) {
      const result = await storage.callCloudFunction('checkTrainingPermission', { trainingId })
      if (result && result.success) {
        const isCreator = result.isCreator || false
        const isCoach = result.isCoach || false
        const isAssistant = result.isAssistant || false
        return {
          isCreator,
          isCoach,
          isAssistant,
          canEdit: isCreator || isCoach || isAssistant
        }
      }
    }
  } catch (e) {
    console.error('Check training permission error:', e)
  }
  return { isCreator: false, isCoach: false, isAssistant: false, canEdit: false }
}

module.exports = {
  syncUserFromCloud,
  calculateGroupStats,
  checkPermissionFromCloud,
  verifyAssistantCode,
  checkTrainingPermission
}
