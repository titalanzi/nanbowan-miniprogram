const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { status, limit, skip = 0 } = event

  // 分页场景使用 createdAt 倒序（最近的比赛在前），并用 _id 作稳定次级排序；
  // 非分页场景保持历史行为（updatedAt 倒序），确保 active 等旧调用方不受影响。
  const usePaging = typeof limit === 'number' && limit > 0
  console.log('Getting matches from cloud, status:', status, 'paging:', usePaging, 'skip:', skip, 'limit:', limit)

  try {
    let query = usePaging
      ? db.collection('matches').orderBy('createdAt', 'desc').orderBy('_id', 'desc')
      : db.collection('matches').orderBy('updatedAt', 'desc')

    if (status === 'active') {
      query = query.where({ status: _.in(['active', 'pending']) })
    } else if (status === 'finished') {
      query = query.where({ status: 'finished' })
    } else if (status) {
      query = query.where({ status })
    }

    if (usePaging) {
      query = query.skip(skip).limit(limit)
    }

    const result = await query.get()
    console.log('Found', result.data.length, 'matches')
    return { success: true, data: result.data }
  } catch (error) {
    console.error('Error getting matches:', error)
    return { success: false, message: error.message }
  }
}