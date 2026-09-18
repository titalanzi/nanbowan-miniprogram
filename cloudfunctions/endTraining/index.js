const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId } = event

  try {
    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该训练' }
    }
    const training = trainingRes.data[0]

    const isCreator = OPENID === training.creatorOpenId
    const coaches = Array.isArray(training.coaches) ? training.coaches : []
    const isCoach = OPENID === training.coachOpenId || coaches.some(c => c.openid === OPENID)

    let isAssistant = false
    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    if (userRes.data.length > 0) {
      isAssistant = userRes.data[0].role === 'assistant'
    }

    if (!isCreator && !isCoach && !isAssistant) {
      return { success: false, error: '无权限：只有创建者、教练或主理人助理可以结束训练' }
    }

    await db.collection('trainings').where({ id: trainingId }).update({
      data: { status: '已结束', updatedAt: new Date().toISOString() }
    })

    return { success: true }
  } catch (error) {
    console.error('Error ending training:', error)
    return { success: false, error: error.message }
  }
}
