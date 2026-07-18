const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, qrCodeKey, shortCode, userName, userAvatar } = event

  try {
    let query = {}
    if (trainingId) {
      query.id = trainingId
    } else if (qrCodeKey) {
      query.qrCodeKey = qrCodeKey
    } else if (shortCode) {
      query.shortCode = shortCode
    } else {
      return { success: false, error: '缺少签到参数' }
    }

    const trainingRes = await db.collection('trainings').where(query).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到对应训练' }
    }
    const training = trainingRes.data[0]

    if (training.status === '已结束') {
      return { success: false, error: '队训已结束，无法加入' }
    }

    const attendeeRes = await db.collection('training_attendees').where({
      trainingId: training.id,
      userOpenId: OPENID
    }).get()

    if (attendeeRes.data.length > 0) {
      return { success: true, alreadyCheckedIn: true, training }
    }

    const now = new Date().toISOString()
    await db.collection('training_attendees').add({
      data: {
        trainingId: training.id,
        userOpenId: OPENID,
        nickName: userName || '',
        avatarUrl: userAvatar || '',
        checkInTime: now,
        createdAt: now
      }
    })

    await db.collection('trainings').where({ id: training.id }).update({
      data: {
        attendeeCount: _.inc(1),
        updatedAt: now
      }
    })

    if (userName || userAvatar) {
      const userRes = await db.collection('users').where({ openid: OPENID }).get()
      if (userRes.data.length > 0) {
        const updateData = { updatedAt: now }
        if (userName) updateData.name = userName
        if (userAvatar) updateData.avatar = userAvatar
        await db.collection('users').where({ openid: OPENID }).update({
          data: updateData
        })
      }
    }

    return { success: true, alreadyCheckedIn: false, training }
  } catch (error) {
    console.error('Error checking in training:', error)
    return { success: false, error: error.message }
  }
}
