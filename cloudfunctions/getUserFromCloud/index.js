const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  try {
    console.log('getUserFromCloud - OPENID:', OPENID)

    const result = await db.collection('users').where({ openid: OPENID }).get()

    if (result.data.length > 0) {
      const sorted = result.data.sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      )

      const userData = sorted[0]
      console.log('getUserFromCloud - 找到用户, _id:', userData._id, 'id:', userData.id)

      if (!userData.id && userData._id) {
        userData.id = userData._id
      }

      return {
        success: true,
        data: userData
      }
    } else {
      console.log('getUserFromCloud - 用户不存在, OPENID:', OPENID)
      return { success: false, message: '用户不存在' }
    }
  } catch (error) {
    console.error('getUserFromCloud error:', error)
    return { success: false, message: error.message || '服务器错误' }
  }
}
