const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { moment } = event
  const { OPENID } = cloud.getWXContext()
  
  try {
    await db.collection('moments').add({
      data: {
        ...moment,
        openid: OPENID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    })
    return { success: true, message: '发布成功' }
  } catch (error) {
    return { success: false, message: error.message }
  }
}