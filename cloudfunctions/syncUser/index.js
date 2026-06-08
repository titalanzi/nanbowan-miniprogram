const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  const { user } = event
  const { OPENID } = cloud.getWXContext()
  
  if (!user || !user.name) {
    return { success: false, message: '用户信息不完整' }
  }
  
  try {
    const existing = await db.collection('users').where({ openid: OPENID }).get()
    
    if (existing.data.length > 0) {
      const docId = existing.data[0]._id
      const updateData = {
        name: user.name,
        avatar: user.avatar || '',
        role: user.role || 'normal',
        openid: OPENID,
        registered: true,
        updatedAt: new Date().toISOString()
      }
      
      await db.collection('users').doc(docId).update({
        data: updateData
      })
      
      return { success: true, message: '更新成功' }
    } else {
      const newUser = {
        name: user.name,
        avatar: user.avatar || '',
        role: user.role || 'normal',
        openid: OPENID,
        id: user.id || ('user_' + Date.now()),
        registered: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await db.collection('users').add({
        data: newUser
      })
      
      return { success: true, message: '保存成功' }
    }
  } catch (error) {
    console.error('syncUser error:', error)
    return { success: false, message: error.message || '服务器错误' }
  }
}