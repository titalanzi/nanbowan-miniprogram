const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { momentId } = event
  
  try {
    const existing = await db.collection('moments').where({ id: momentId }).get()
    
    if (existing.data.length > 0) {
      await db.collection('moments').doc(existing.data[0]._id).remove()
      return { success: true, message: '删除成功' }
    } else {
      return { success: false, message: '动态不存在' }
    }
  } catch (error) {
    return { success: false, message: error.message }
  }
}