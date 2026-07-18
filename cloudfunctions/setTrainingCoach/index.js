const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, coachOpenId, coachName, coachAvatar } = event

  try {
    if (!trainingId || !coachOpenId) {
      return { success: false, error: '缺少参数' }
    }

    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该队训' }
    }

    const training = trainingRes.data[0]

    // 权限校验：仅创建者或主理人助理可指定教练
    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    const user = userRes.data[0] || {}
    const isCreator = OPENID === training.creatorOpenId
    const isAssistant = user.role === 'assistant'

    if (!isCreator && !isAssistant) {
      return { success: false, error: '无权限' }
    }

    // 校验被指定者是否在签到列表中
    const attendeeRes = await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: coachOpenId
    }).get()

    if (attendeeRes.data.length === 0) {
      return { success: false, error: '该用户未加入队训' }
    }

    const now = new Date().toISOString()
    await db.collection('trainings').where({ id: trainingId }).update({
      data: {
        coachOpenId: coachOpenId,
        coachName: coachName || '',
        coachAvatar: coachAvatar || '',
        updatedAt: now
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error setting training coach:', error)
    return { success: false, error: error.message }
  }
}
