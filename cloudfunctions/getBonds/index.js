const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloudbase-d1gy9zpsb97f7c289' })

const db = cloud.database()

// 读取 bonds 集合中已启用的羁绊配置，按 sort 升序返回
exports.main = async (event, context) => {
  try {
    const result = await db.collection('bonds')
      .where({ isActive: true })
      .orderBy('sort', 'asc')
      .get()

    return { success: true, data: result.data }
  } catch (error) {
    console.error('getBonds error:', error)
    return { success: false, data: [], message: error.message || '获取羁绊配置失败' }
  }
}
