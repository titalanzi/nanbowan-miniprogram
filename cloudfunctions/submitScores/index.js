const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, scores } = event

  try {
    // 校验调用者是该训练的 coachOpenId
    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该训练' }
    }
    const training = trainingRes.data[0]

    if (OPENID !== training.coachOpenId) {
      return { success: false, error: '无权限：只有教练可以提交评分' }
    }

    // 遍历 scores 数组，批量更新 training_attendees
    const now = new Date().toISOString()
    for (const item of scores) {
      const { userOpenId, scores: dimensionScores, coachComment } = item
      const scoreValues = Object.values(dimensionScores)
      const totalScore = scoreValues.reduce((sum, s) => sum + (Number(s) || 0), 0)
      const avgScore = Number((totalScore / scoreValues.length).toFixed(1))

      await db.collection('training_attendees').where({
        trainingId,
        userOpenId
      }).update({
        data: {
          scores: dimensionScores,
          totalScore,
          avgScore,
          coachComment,
          updatedAt: now
        }
      })
    }

    // 更新 trainings.scoreCompleted = true
    await db.collection('trainings').where({ id: trainingId }).update({
      data: { scoreCompleted: true, updatedAt: now }
    })

    return { success: true }
  } catch (error) {
    console.error('Error submitting scores:', error)
    return { success: false, error: error.message }
  }
}
