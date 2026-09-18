const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, scores, groupScores } = event

  console.log('=== submitScores 调试 ===')
  console.log('参数:', { trainingId, hasScores: !!scores, hasGroupScores: !!groupScores })

  try {
    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该训练' }
    }
    const training = trainingRes.data[0]

    const coaches = Array.isArray(training.coaches) ? training.coaches : []
    const isCoach = OPENID === training.coachOpenId || coaches.some(c => c.openid === OPENID)

    let isCaptain = false
    let captainGroupId = ''
    const captains = Array.isArray(training.captains) ? training.captains : []
    const captainInfo = captains.find(c => c.openid === OPENID)
    if (captainInfo) {
      isCaptain = true
      captainGroupId = captainInfo.groupId || ''
    }

    // 双重验证：也从 training_attendees 表检查 isCaptain 字段
    if (!isCaptain) {
      try {
        const attendeeRes = await db.collection('training_attendees').where({
          trainingId,
          userOpenId: OPENID,
          isCaptain: true
        }).get()
        if (attendeeRes.data.length > 0) {
          isCaptain = true
          captainGroupId = attendeeRes.data[0].captainGroupId || attendeeRes.data[0].groupId || ''
        }
      } catch (e) {
        console.log('从 training_attendees 检查队长身份失败:', e)
      }
    }

    if (!isCoach && !isCaptain) {
      return { success: false, error: '无权限：只有教练和队长可以提交评分' }
    }

    const now = new Date().toISOString()

    // 队员评分：仅队长提交，教练不提交队员评分
    if (isCaptain && Array.isArray(scores) && scores.length > 0) {
      console.log('队长提交队员评分, 数量:', scores.length)
      for (const item of scores) {
        const { userOpenId, scores: dimensionScores, coachComment } = item

        if (captainGroupId) {
          const attendeeRes = await db.collection('training_attendees').where({
            trainingId,
            userOpenId
          }).get()
          if (attendeeRes.data.length === 0) {
            continue
          }
          const attendee = attendeeRes.data[0]
          if (attendee.groupId !== captainGroupId) {
            continue
          }
        }

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
    }

    // 分组评分：仅教练提交，队长不提交分组评分
    if (isCoach && Array.isArray(groupScores) && groupScores.length > 0) {
      console.log('教练提交分组评分, 数量:', groupScores.length)
      const groupScoresObj = {}
      groupScores.forEach(gs => {
        groupScoresObj[gs.groupId] = {
          scores: gs.scores,
          comment: gs.comment || '',
          updatedAt: now
        }
      })

      await db.collection('trainings').where({ id: trainingId }).update({
        data: {
          groupScores: groupScoresObj,
          updatedAt: now
        }
      })
    }

    // 无论教练还是队长提交，都标记为已完成
    await db.collection('trainings').where({ id: trainingId }).update({
      data: { scoreCompleted: true, updatedAt: now }
    })

    console.log('评分提交成功')
    return { success: true }
  } catch (error) {
    console.error('Error submitting scores:', error)
    return { success: false, error: error.message }
  }
}
