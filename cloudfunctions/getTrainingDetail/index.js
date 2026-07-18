const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { trainingId } = event

  try {
    const trainingRes = await db.collection('trainings').where({ id: trainingId }).get()
    if (trainingRes.data.length === 0) {
      return { success: false, error: '未找到该训练' }
    }
    const training = trainingRes.data[0]

    const attendeesRes = await db.collection('training_attendees').where({ trainingId }).get()

    return { success: true, data: { training, attendees: attendeesRes.data } }
  } catch (error) {
    console.error('Error getting training detail:', error)
    return { success: false, error: error.message }
  }
}
