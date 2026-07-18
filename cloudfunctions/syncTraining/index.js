const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { training } = event

  try {
    const res = await db.collection('trainings').where({ id: training.id }).get()

    if (res.data.length > 0) {
      // 存在则更新
      await db.collection('trainings').where({ id: training.id }).update({
        data: { ...training, updatedAt: new Date().toISOString() }
      })
    } else {
      // 不存在则新增
      await db.collection('trainings').add({ data: training })
    }

    return { success: true }
  } catch (error) {
    console.error('Error syncing training:', error)
    return { success: false, error: error.message }
  }
}
