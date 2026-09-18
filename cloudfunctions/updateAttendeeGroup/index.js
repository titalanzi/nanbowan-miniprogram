const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, userOpenId, groupId } = event

  console.log('=== updateAttendeeGroup 调试 ===')
  console.log('参数:', { trainingId, userOpenId, groupId })

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

    const attendeeRes = await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).get()

    if (attendeeRes.data.length === 0) {
      return { success: false, error: '该用户未加入队训' }
    }

    const attendee = attendeeRes.data[0]
    const wasCaptain = attendee.isCaptain

    let validGroupId = ''
    if (groupId && Array.isArray(training.groups) && training.groups.length > 0) {
      const matched = training.groups.find(g => g.id === groupId)
      if (matched) {
        validGroupId = groupId
      }
    }

    // 如果被移动的用户是队长，自动取消其队长身份
    if (wasCaptain) {
      console.log('该用户是队长，移动分组时自动取消队长身份')
      const captains = Array.isArray(training.captains) ? [...training.captains] : []
      const filteredCaptains = captains.filter(c => c.openid !== userOpenId)

      await db.collection('trainings').where({ id: trainingId }).update({
        data: {
          captains: filteredCaptains,
          updatedAt: new Date().toISOString()
        }
      })
    }

    // 更新签到记录
    const updateData = {
      groupId: validGroupId,
      updatedAt: new Date().toISOString()
    }

    if (wasCaptain) {
      updateData.isCaptain = false
      updateData.captainGroupId = ''
    }

    await db.collection('training_attendees').where({
      trainingId: trainingId,
      userOpenId: userOpenId
    }).update({ data: updateData })

    return { success: true, wasCaptain: wasCaptain }
  } catch (error) {
    console.error('Error updating attendee group:', error)
    return { success: false, error: error.message }
  }
}