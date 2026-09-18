const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const DEFAULT_AVATAR = 'cloud://cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250/avatars/morentouxiang.jpg'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { title, startTime, endTime, location, description, coachOpenId, coachName, coachAvatar, groups, coaches } = event

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
      groups: groups || [],
      coaches: coaches || [],
      groupScores: {},
      startTime,
      endTime,
      location,
      description,
      status: '报名中',
      qrCodeKey,
      shortCode,
      creatorOpenId: OPENID,
      coachDimensions: ['传盘选择', '进攻战术执行度', '防守战术执行度', '传盘基本功', '接盘稳定性'],
      captainDimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
      dimensions: ['传盘成功率', '接盘稳定性', '防守执行率'],
      attendeeCount: 0,
      scoreCompleted: false,
      createdAt: now,
      updatedAt: now
    }

    await db.collection('trainings').add({ data: training })

    // 从 users 表查询创建者信息，确保性别等字段完整
    let creatorGender = event.creatorGender || ''
    let creatorName = event.creatorName || ''
    let creatorAvatar = event.creatorAvatar || ''

    try {
      const userRes = await db.collection('users').where({ openid: OPENID }).get()
      if (userRes.data.length > 0) {
        const user = userRes.data[0]
        creatorName = creatorName || user.name || ''
        creatorAvatar = creatorAvatar || user.avatar || DEFAULT_AVATAR
        creatorGender = creatorGender || user.gender || ''
      }
    } catch (e) {
      console.log('查询创建者用户信息失败:', e)
    }

    await db.collection('training_attendees').add({
      data: {
        trainingId: training.id,
        userOpenId: OPENID,
        nickName: creatorName,
        avatarUrl: creatorAvatar,
        gender: creatorGender,
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
