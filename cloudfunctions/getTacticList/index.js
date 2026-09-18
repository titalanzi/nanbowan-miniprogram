const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  try {
    const res = await db.collection('tactics')
      .where({
        creatorOpenId: OPENID,
        type: 'mine'
      })
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get()

    // 返回简略字段，节省带宽（不含 steps）
    const list = (res.data || []).map(doc => ({
      id: doc._id,
      name: doc.name,
      stepCount: doc.stepCount || 0,
      playerCount: doc.playerCount || 0,
      hasDisc: !!doc.hasDisc,
      players: doc.players || [],
      updatedAt: doc.updatedAt || '',
      createdAt: doc.createdAt || ''
    }))

    return { success: true, data: { list } }
  } catch (error) {
    console.error('getTacticList error:', error)
    return { success: false, message: error.message, data: { list: [] } }
  }
}
