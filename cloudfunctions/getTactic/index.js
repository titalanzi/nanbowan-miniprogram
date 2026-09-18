const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { id, code } = event
  const docId = id || code

  if (!docId) {
    return { success: false, message: '缺少战术 id 或 code' }
  }

  try {
    const res = await db.collection('tactics').doc(docId).get()
    const doc = res && res.data
    if (!doc) {
      return { success: false, message: '未找到该战术' }
    }

    // 分享快照：任何人都可查看
    if (doc.type === 'snapshot') {
      return {
        success: true,
        data: doc.tacticData || null,
        isSnapshot: true,
        creatorOpenId: doc.creatorOpenId
      }
    }

    // 我的战术：创建者拿完整数据；他人拿只读数据（用于分享场景）
    const isOwner = doc.creatorOpenId === OPENID

    return {
      success: true,
      data: {
        id: doc._id,
        name: doc.name,
        steps: doc.steps,
        currentIndex: doc.currentIndex,
        players: doc.players,
        hasDisc: doc.hasDisc,
        playerCount: doc.playerCount,
        stepCount: doc.stepCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      },
      isSnapshot: false,
      isOwner,
      creatorOpenId: doc.creatorOpenId
    }
  } catch (error) {
    console.error('getTactic error:', error)
    return { success: false, message: error.message }
  }
}
