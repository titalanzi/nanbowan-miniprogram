const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_AVATAR = 'cloud://cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250/avatars/morentouxiang.jpg'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, userOpenId, groupId } = event

  console.log('=== setCaptain 调试 ===')
  console.log('参数:', { trainingId, userOpenId, groupId })

  try {
    if (!trainingId || !userOpenId) {
      return { success: false, error: '缺少参数' }
    }

    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该队训' }
    }

    const training = trainingRes.data[0]

    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    const user = userRes.data[0] || {}
    const isCreator = OPENID === training.creatorOpenId
    const isAssistant = user.role === 'assistant'
    const isCoach = Array.isArray(training.coaches) && training.coaches.some(c => c.openid === OPENID)

    if (!isCreator && !isAssistant && !isCoach) {
      return { success: false, error: '无权限' }
    }

    const attendeeRes = await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).get()

    if (attendeeRes.data.length === 0) {
      return { success: false, error: '该用户未加入队训' }
    }

    if (groupId && (!Array.isArray(training.groups) || !training.groups.find(g => g.id === groupId))) {
      return { success: false, error: '分组不存在' }
    }

    const captains = Array.isArray(training.captains) ? [...training.captains] : []

    // 检查该用户是否已经是该组的队长（避免重复添加）
    const existingIndex = captains.findIndex(c => c.groupId === groupId && c.openid === userOpenId)

    if (existingIndex !== -1) {
      console.log('该用户已是此分组队长，无需重复添加')
      return { success: true, message: '已是该分组队长' }
    }

    // 添加新队长（支持多个队长）
    captains.push({
      groupId: groupId,
      openid: userOpenId,
      name: attendeeRes.data[0].nickName || '',
      avatar: attendeeRes.data[0].avatarUrl || DEFAULT_AVATAR
    })

    console.log('添加队长成功，当前队长列表:', JSON.stringify(captains))

    await db.collection('trainings').where({ id: trainingId }).update({
      data: {
        captains: captains,
        updatedAt: new Date().toISOString()
      }
    })

    await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).update({
      data: {
        isCaptain: true,
        captainGroupId: groupId,
        updatedAt: new Date().toISOString()
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error setting captain:', error)
    return { success: false, error: error.message }
  }
}
