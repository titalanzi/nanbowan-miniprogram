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
    const isCoach = OPENID === training.coachOpenId

    // 查询用户角色，判断是否是助理
    let isAssistant = false
    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    if (userRes.data.length > 0) {
      isAssistant = userRes.data[0].role === 'assistant'
    }

    return {
      success: true,
      isCreator,
      isCoach,
      isAssistant,
      canEdit: isCreator || isCoach || isAssistant
    }
  } catch (error) {
    console.error('Error checking training permission:', error)
    return { success: false, error: error.message }
  }
}
