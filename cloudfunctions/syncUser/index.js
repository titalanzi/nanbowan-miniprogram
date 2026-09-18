const cloud = require('wx-server-sdk')

cloud.init()

const db = cloud.database()

const DEFAULT_AVATAR = 'cloud://cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250/avatars/morentouxiang.jpg'

exports.main = async (event, context) => {
  const { user } = event
  const { OPENID } = cloud.getWXContext()

  if (!user || !user.name) {
    return { success: false, message: '用户信息不完整' }
  }

  try {
    const existing = await db.collection('users').where({ openid: OPENID }).get()

    const updateData = {
      name: user.name,
      avatar: user.avatar || DEFAULT_AVATAR,
      gender: user.gender || '',
      role: user.role || 'normal',
      openid: OPENID,
      registered: true,
      updatedAt: new Date().toISOString()
    }

    if (existing.data.length > 1) {
      // 存在重复记录：保留最新的一条，删除其余的
      const sorted = existing.data.sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      )
      const keepDocId = sorted[0]._id

      // 删除重复记录
      for (let i = 1; i < sorted.length; i++) {
        try {
          await db.collection('users').doc(sorted[i]._id).remove()
        } catch (e) {
          console.error('Remove duplicate failed:', sorted[i]._id, e)
        }
      }

      // 更新保留的记录
      await db.collection('users').doc(keepDocId).update({ data: updateData })

      return { success: true, message: '已清理重复记录并更新' }
    } else if (existing.data.length === 1) {
      // 只有一条记录，直接更新
      await db.collection('users').doc(existing.data[0]._id).update({ data: updateData })
      return { success: true, message: '更新成功' }
    } else {
      // 没有记录，创建新的
      const newUser = {
        ...updateData,
        id: user.id || ('user_' + Date.now()),
        createdAt: new Date().toISOString()
      }

      await db.collection('users').add({ data: newUser })
      return { success: true, message: '保存成功' }
    }
  } catch (error) {
    console.error('syncUser error:', error)
    return { success: false, message: error.message || '服务器错误' }
  }
}
