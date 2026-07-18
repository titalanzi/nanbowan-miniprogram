const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  try {
    // 查询 training_attendees where userOpenId，获取 trainingId 列表和自己的评分数据
    const attendeesRes = await db.collection('training_attendees').where({ userOpenId: OPENID }).get()

    const result = []
    for (const attendee of attendeesRes.data) {
      const trainingRes = await db.collection('trainings').where({ id: attendee.trainingId }).get()
      if (trainingRes.data.length > 0) {
        result.push({
          training: trainingRes.data[0],
          myScore: {
            scores: attendee.scores,
            totalScore: attendee.totalScore,
            avgScore: attendee.avgScore,
            coachComment: attendee.coachComment
          }
        })
      }
    }

    return { success: true, data: result }
  } catch (error) {
    console.error('Error getting my trainings:', error)
    return { success: false, error: error.message }
  }
}
