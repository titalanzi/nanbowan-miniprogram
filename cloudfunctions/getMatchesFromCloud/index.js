const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { status } = event
  
  console.log('Getting matches from cloud, status:', status)
  
  try {
    let query = db.collection('matches').orderBy('updatedAt', 'desc')
    
    if (status) {
      query = query.where({ status })
    }
    
    const result = await query.get()
    console.log('Found', result.data.length, 'matches')
    result.data.forEach(m => console.log('Match:', m.id, 'status:', m.status))
    return { success: true, data: result.data }
  } catch (error) {
    console.error('Error getting matches:', error)
    return { success: false, message: error.message }
  }
}