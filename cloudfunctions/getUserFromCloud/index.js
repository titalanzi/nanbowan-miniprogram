const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  
  try {
    const result = await db.collection('users').where({ openid: OPENID }).get()
    
    if (result.data.length > 0) {
      return { 
        success: true, 
        data: result.data[0] 
      }
    } else {
      return { success: false, message: '用户不存在' }
    }
  } catch (error) {
    console.error('getUserFromCloud error:', error)
    return { success: false, message: error.message || '服务器错误' }
  }
}