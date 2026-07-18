const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { trainingId } = event

  try {
    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该训练' }
    }
    const training = trainingRes.data[0]

    // 校验 trainings.coachOpenId 不为空（必须有教练）
    if (!training.coachOpenId) {
      return { success: false, error: '该训练尚未分配教练，无法结束' }
    }

    // 校验调用者是创建者或教练
    if (OPENID !== training.creatorOpenId && OPENID !== training.coachOpenId) {
      return { success: false, error: '无权限：只有创建者或教练可以结束训练' }
    }

    // 更新 status = '已结束'
    await db.collection('trainings').where({ id: trainingId }).update({
      data: { status: '已结束', updatedAt: new Date().toISOString() }
    })

    return { success: true }
  } catch (error) {
    console.error('Error ending training:', error)
    return { success: false, error: error.message }
  }
}
