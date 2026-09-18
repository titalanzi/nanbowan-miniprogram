const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

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

    // 权限校验：创建者 / 主理人助理 / 教练 可移除成员
    const userRes = await db.collection('users').where({ openid: OPENID }).get()
    const user = userRes.data[0] || {}
    const isCreator = OPENID === training.creatorOpenId
    const isAssistant = user.role === 'assistant'
    const isCoach = OPENID === training.coachOpenId

    if (!isCreator && !isAssistant && !isCoach) {
      return { success: false, error: '无权限' }
    }

    // 不能移除自己（创建者/教练自身应通过其他流程退出）
    if (userOpenId === OPENID) {
      return { success: false, error: '不能移除自己' }
    }

    // 删除签到记录
    const removeRes = await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).remove()

    // 更新签到人数
    const now = new Date().toISOString()
    const newCount = Math.max(0, (training.attendeeCount || 1) - 1)
    const updateData = { attendeeCount: newCount, updatedAt: now }

    // 如果被移除的是教练，清空教练信息
    if (training.coachOpenId === userOpenId) {
      updateData.coachOpenId = ''
      updateData.coachName = ''
      updateData.coachAvatar = ''
    }

    await db.collection('trainings').where({ id: trainingId }).update({ data: updateData })

    return { success: true, removed: removeRes.stats.removed, newCount }
  } catch (error) {
    console.error('Error removing training attendee:', error)
    return { success: false, error: error.message }
  }
}
