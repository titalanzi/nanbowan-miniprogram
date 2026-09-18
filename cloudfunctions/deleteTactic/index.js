const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { id } = event

  if (!id) {
    return { success: false, message: '缺少战术 id' }
  }

  try {
    // 先校验：只能删除自己的战术
    const res = await db.collection('tactics').doc(id).get()
    const doc = res && res.data
    if (!doc) {
      return { success: false, message: '战术不存在' }
    }
    if (doc.creatorOpenId !== OPENID) {
      return { success: false, message: '无权删除他人战术' }
    }

    await db.collection('tactics').doc(id).remove()
    return { success: true }
  } catch (error) {
    console.error('deleteTactic error:', error)
    return { success: false, message: error.message }
  }
}
