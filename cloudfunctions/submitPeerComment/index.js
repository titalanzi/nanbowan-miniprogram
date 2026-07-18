const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId, targetUserId, content } = event

  try {
    // 校验调用者已签到（training_attendees 中有记录）
    const myAttendeeRes = await db.collection('training_attendees').where({
      trainingId,
      userOpenId: OPENID
    }).get()

    if (myAttendeeRes.data.length === 0) {
      return { success: false, error: '您尚未签到，无法提交互评' }
    }
    const myAttendee = myAttendeeRes.data[0]

    // 找到 targetUserId 对应的 attendee 记录
    const targetRes = await db.collection('training_attendees').where({
      trainingId,
      userOpenId: targetUserId
    }).get()

    if (targetRes.data.length === 0) {
      return { success: false, error: '目标用户未签到' }
    }

    // push 到 peerComments 数组
    const comment = {
      fromUserId: OPENID,
      fromUserNickName: myAttendee.nickName || '',
      content,
      createdAt: new Date().toISOString()
    }

    await db.collection('training_attendees').where({
      trainingId,
      userOpenId: targetUserId
    }).update({
      data: {
        peerComments: _.push([comment])
      }
    })

    return { success: true }
  } catch (error) {
    console.error('Error submitting peer comment:', error)
    return { success: false, error: error.message }
  }
}
