const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, userOpenId } = event

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

    if (!isCreator && !isAssistant) {
      return { success: false, error: '无权限' }
    }

    const coaches = Array.isArray(training.coaches) ? training.coaches : []
    const coachIndex = coaches.findIndex(c => c.openid === userOpenId)
    if (coachIndex === -1) {
      return { success: false, error: '该用户不是教练' }
    }

    coaches.splice(coachIndex, 1)

    await db.collection('trainings').where({ id: trainingId }).update({
      data: {
        coaches: coaches,
        updatedAt: new Date().toISOString()
      }
    })

    await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).update({
      data: {
        isCoach: false,
        updatedAt: new Date().toISOString()
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error removing coach role:', error)
    return { success: false, error: error.message }
  }
}