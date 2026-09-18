const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DEFAULT_AVATAR = 'cloud://cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250/avatars/morentouxiang.jpg'

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, qrCodeKey, shortCode, userName, userAvatar, userGender, groupId, isCoach } = event

  console.log('=== checkInTraining 调试 ===')
  console.log('OPENID:', OPENID)
  console.log('传入参数:', { trainingId, groupId, isCoach, userName, userGender })

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
    console.log('找到队训:', training.id, '标题:', training.title)
    console.log('队训分组:', JSON.stringify(training.groups))

    if (training.status === '已结束') {
      return { success: false, error: '队训已结束，无法加入' }
    }

    const attendeeRes = await db.collection('training_attendees').where({
      trainingId: training.id,
      userOpenId: OPENID
    }).get()

    console.log('现有签到记录数:', attendeeRes.data.length)
    if (attendeeRes.data.length > 0) {
      console.log('现有记录详情:', JSON.stringify(attendeeRes.data.map(a => ({
        groupId: a.groupId,
        isCoach: a.isCoach,
        nickName: a.nickName
      }))))
    }

    // 如果有多条记录，清理重复记录（保留最新的）
    if (attendeeRes.data.length > 1) {
      console.log('检测到重复记录，开始清理')
      const sorted = attendeeRes.data.sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
      // 删除除第一条外的所有记录
      for (let i = 1; i < sorted.length; i++) {
        try {
          await db.collection('training_attendees').doc(sorted[i]._id).remove()
          console.log('删除重复记录:', sorted[i]._id)
        } catch (e) {
          console.error('删除重复记录失败:', sorted[i]._id, e)
        }
      }
    }

    // 如果存在记录，更新分组信息（如果用户选择了新的分组）
    if (attendeeRes.data.length > 0) {
      const existingRecord = attendeeRes.data[0]
      console.log('已存在记录，当前 groupId:', existingRecord.groupId, '传入 groupId:', groupId)

      // 校验分组是否合法
      let validGroupId = existingRecord.groupId || ''
      if (groupId && Array.isArray(training.groups) && training.groups.length > 0) {
        const matched = training.groups.find(g => g.id === groupId)
        if (matched) {
          validGroupId = groupId
          console.log('分组校验通过:', groupId)
        } else {
          console.log('分组校验失败，未找到匹配分组:', groupId)
        }
      }

      // 如果分组有变化，更新记录
      if (validGroupId !== existingRecord.groupId) {
        console.log('更新分组:', existingRecord.groupId, '->', validGroupId)
        await db.collection('training_attendees').doc(existingRecord._id).update({
          data: {
            groupId: validGroupId,
            updatedAt: new Date().toISOString()
          }
        })
      }

      return { success: true, alreadyCheckedIn: true, training }
    }

    // 校验分组是否合法（若队训配置了分组）
    let validGroupId = ''
    if (groupId && Array.isArray(training.groups) && training.groups.length > 0) {
      const matched = training.groups.find(g => g.id === groupId)
      if (matched) {
        validGroupId = groupId
        console.log('新加入分组校验通过:', groupId)
      } else {
        console.log('新加入分组校验失败:', groupId, '可用分组:', JSON.stringify(training.groups.map(g => g.id)))
      }
    } else {
      console.log('未传入分组或队训无分组配置, groupId:', groupId, 'groups:', JSON.stringify(training.groups))
    }

    // 是否以教练身份签到
    const joinAsCoach = !!isCoach

    const now = new Date().toISOString()
    console.log('创建新签到记录, groupId:', validGroupId, 'isCoach:', joinAsCoach)
    await db.collection('training_attendees').add({
      data: {
        trainingId: training.id,
        userOpenId: OPENID,
        nickName: userName || '',
        avatarUrl: userAvatar || DEFAULT_AVATAR,
        gender: userGender || '',
        groupId: validGroupId,
        isCoach: joinAsCoach,
        checkInTime: now,
        createdAt: now
      }
    })

    // 若以教练身份签到，加入 training.coaches 列表
    const updateData = {
      attendeeCount: _.inc(1),
      updatedAt: now
    }
    if (joinAsCoach) {
      const coaches = Array.isArray(training.coaches) ? training.coaches : []
      const coachExists = coaches.some(c => c.openid === OPENID)
      if (!coachExists) {
        updateData.coaches = _.push({
          openid: OPENID,
          name: userName || '',
          avatar: userAvatar || DEFAULT_AVATAR,
          gender: userGender || ''
        })
      }
    }

    await db.collection('trainings').where({ id: training.id }).update({
      data: updateData
    })

    // 同步用户信息（昵称、头像、性别）
    if (userName || userAvatar || userGender) {
      const userRes = await db.collection('users').where({ openid: OPENID }).get()
      if (userRes.data.length > 0) {
        const userUpdate = { updatedAt: now }
        if (userName) userUpdate.name = userName
        if (userAvatar) userUpdate.avatar = userAvatar
        else userUpdate.avatar = DEFAULT_AVATAR
        if (userGender) userUpdate.gender = userGender
        await db.collection('users').where({ openid: OPENID }).update({
          data: userUpdate
        })
      }
    }

    return { success: true, alreadyCheckedIn: false, training }
  } catch (error) {
    console.error('Error checking in training:', error)
    return { success: false, error: error.message }
  }
}
