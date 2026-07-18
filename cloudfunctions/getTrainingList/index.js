const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { status } = event

  try {
    let query = db.collection('trainings').orderBy('createdAt', 'desc')

    if (status === 'finished') {
      // status='finished' 过滤已结束
      query = query.where({ status: '已结束' })
    } else if (status === 'active') {
      // status='active' 过滤报名中+进行中
      query = query.where({ status: _.in(['报名中', '进行中']) })
    }

    const result = await query.get()

    // 为每个队训附加签到人员头像列表
    const trainings = result.data
    for (const t of trainings) {
      try {
        const attendeesRes = await db.collection('training_attendees')
          .where({ trainingId: t.id })
          .field({ avatarUrl: true })
          .limit(10)
          .get()
        t.attendeeAvatars = (attendeesRes.data || []).map(a => a.avatarUrl || '')
      } catch (e) {
        t.attendeeAvatars = []
      }
    }

    return { success: true, data: trainings }
  } catch (error) {
    console.error('Error getting training list:', error)
    return { success: false, error: error.message }
  }
}
