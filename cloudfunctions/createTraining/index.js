const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { title, startTime, endTime, location, description, coachOpenId, coachName, coachAvatar } = event

  try {
    // 生成6位随机字母数字 shortCode（大写）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let shortCode = ''
    for (let i = 0; i < 6; i++) {
      shortCode += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const qrCodeKey = 'T_' + shortCode

    const now = new Date().toISOString()
    const training = {
      id: 'training_' + Date.now(),
      title,
      coachOpenId,
      coachName,
      coachAvatar,
      startTime,
      endTime,
      location,
      description,
      status: '报名中',
      qrCodeKey,
      shortCode,
      creatorOpenId: OPENID,
      dimensions: ['传盘稳定性', '接盘成功率', '跑动与空间', '战术理解', '飞盘精神'],
      attendeeCount: 0,
      scoreCompleted: false,
      createdAt: now,
      updatedAt: now
    }

    await db.collection('trainings').add({ data: training })

    await db.collection('training_attendees').add({
      data: {
        trainingId: training.id,
        userOpenId: OPENID,
        nickName: event.creatorName || '',
        avatarUrl: event.creatorAvatar || '',
        checkInTime: now,
        createdAt: now,
        isCreator: true
      }
    })

    await db.collection('trainings').where({ id: training.id }).update({
      data: { attendeeCount: 1, updatedAt: now }
    })

    return { success: true, data: training }
  } catch (error) {
    console.error('Error creating training:', error)
    return { success: false, error: error.message }
  }
}
