const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { tacticData, id, mode } = event

  try {
    const now = new Date().toISOString()

    // 生成分享快照（用于分享给好友）
    if (mode === 'share') {
      const docId = `SHARE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      await db.collection('tactics').doc(docId).set({
        data: {
          type: 'snapshot',
          creatorOpenId: OPENID,
          tacticData,
          createdAt: now,
          updatedAt: now
        }
      })
      return { success: true, data: { code: docId } }
    }

    // 保存/更新到"我的战术"
    const docId = id || `TAC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

    await db.collection('tactics').doc(docId).set({
      data: {
        type: 'mine',
        creatorOpenId: OPENID,
        name: tacticData.name || '新战术',
        steps: tacticData.steps,
        currentIndex: tacticData.currentIndex || 0,
        playerCount: tacticData.playerCount || 0,
        stepCount: tacticData.stepCount || 0,
        players: tacticData.players || [],
        hasDisc: !!tacticData.hasDisc,
        updatedAt: now,
        // 首次创建才写入 createdAt
        createdAt: tacticData.createdAt || now
      }
    })

    return { success: true, data: { id: docId } }
  } catch (error) {
    console.error('saveTactic error:', error)
    return { success: false, message: error.message }
  }
}
