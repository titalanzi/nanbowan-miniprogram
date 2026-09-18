const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, groupId, scores, comment } = event

  try {
    if (!trainingId || !groupId) {
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

    if (!Array.isArray(training.groups) || !training.groups.find(g => g.id === groupId)) {
      return { success: false, error: '分组不存在' }
    }

    const groupScores = training.groupScores || {}
    groupScores[groupId] = {
      scores: scores || {},
      comment: comment || '',
      scoredBy: OPENID,
      scoredAt: new Date().toISOString()
    }

    await db.collection('trainings').where({ id: trainingId }).update({
      data: {
        groupScores: groupScores,
        updatedAt: new Date().toISOString()
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error submitting group scores:', error)
    return { success: false, error: error.message }
  }
}