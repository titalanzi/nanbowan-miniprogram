const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, userOpenId } = event

  console.log('=== cancelCaptain 调试 ===')
  console.log('参数:', { trainingId, userOpenId })

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

    // 从队长列表中移除该用户（只移除匹配 openid 的记录）
    const captains = Array.isArray(training.captains) ? [...training.captains] : []
    const filteredCaptains = captains.filter(c => c.openid !== userOpenId)

    console.log('移除前队长数:', captains.length, '移除后队长数:', filteredCaptains.length)

    await db.collection('trainings').where({ id: trainingId }).update({
      data: {
        captains: filteredCaptains,
        updatedAt: new Date().toISOString()
      }
    })

    // 更新签到记录
    await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).update({
      data: {
        isCaptain: false,
        captainGroupId: '',
        updatedAt: new Date().toISOString()
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error canceling captain:', error)
    return { success: false, error: error.message }
  }
}
