const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { match } = event
  const { OPENID } = cloud.getWXContext()
  
  console.log('Syncing match:', match.id, 'status:', match.status)
  
  try {
    const existing = await db.collection('matches').where({ id: match.id }).get()
    
    if (existing.data.length > 0) {
      console.log('Updating existing match, id:', existing.data[0]._id)
      
      // 从match对象中移除_id字段，避免更新错误
      const { _id, ...matchData } = match
      
      await db.collection('matches').doc(existing.data[0]._id).update({
        data: {
          ...matchData,
          updatedAt: new Date().toISOString()
        }
      })
      console.log('Match updated successfully')
      return { success: true, message: '更新成功' }
    } else {
      console.log('Adding new match')
      await db.collection('matches').add({
        data: {
          ...match,
          openid: OPENID,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      })
      console.log('Match added successfully')
      return { success: true, message: '保存成功' }
    }
  } catch (error) {
    console.error('Error syncing match:', error)
    return { success: false, message: error.message }
  }
}