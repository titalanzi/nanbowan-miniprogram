const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { matchId } = event
  const { OPENID } = cloud.getWXContext()
  
  try {
    if (!matchId) {
      return { success: false, message: '缺少比赛ID' }
    }
    
    // 查找云端的比赛记录
    const result = await db.collection('matches').where({ id: matchId }).get()
    
    if (result.data.length > 0) {
      // 标记为已删除，而不是直接删除
      await db.collection('matches').doc(result.data[0]._id).update({
        data: {
          status: 'deleted',
          updatedAt: new Date().toISOString()
        }
      })
      return { success: true, message: '删除成功' }
    } else {
      return { success: true, message: '云端无此比赛记录' }
    }
  } catch (error) {
    return { success: false, message: error.message }
  }
}
