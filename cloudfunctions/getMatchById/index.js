const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { matchId } = event

  if (!matchId) {
    return { success: false, message: '缺少 matchId 参数' }
  }

  console.log('Getting match by id:', matchId)

  try {
    const result = await db.collection('matches').where({ id: matchId }).get()
    console.log('Found match:', matchId, 'count:', result.data.length)
    if (result.data.length > 0) {
      return { success: true, data: result.data[0] }
    }
    return { success: false, message: '未找到比赛' }
  } catch (error) {
    console.error('Error getting match by id:', error)
    return { success: false, message: error.message }
  }
}
