const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const result = await db.collection('moments')
      .orderBy('createdAt', 'desc')
      .get()
    
    const moments = result.data || []
    
    return { 
      success: true, 
      data: moments.map(item => ({
        id: item.id,
        userId: item.userId,
        userName: item.userName || '匿名用户',
        userAvatar: item.userAvatar || '/images/touxiang/精灵蛋.png',
        content: item.content || '',
        likes: item.likes || [],
        comments: item.comments || [],
        createdAt: item.createdAt || new Date().toISOString()
      }))
    }
  } catch (error) {
    console.error('getMomentsFromCloud error:', error)
    return { success: false, message: error.message || '获取动态失败' }
  }
}