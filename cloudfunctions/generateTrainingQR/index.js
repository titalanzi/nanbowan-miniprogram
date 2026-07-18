const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const { trainingId, qrCodeKey } = event

  try {
    // 调用 openapi 生成小程序码
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: qrCodeKey,
      page: 'packageB/pages/training-checkin/training-checkin',
      width: 280
    })

    const buffer = result.buffer

    // 上传到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: 'training-qr/' + trainingId + '.png',
      fileContent: buffer
    })

    const fileID = uploadRes.fileID

    // 更新 trainings 集合中该记录的 qrCodeFileID
    await db.collection('trainings').where({ id: trainingId }).update({
      data: { qrCodeFileID: fileID, updatedAt: new Date().toISOString() }
    })

    return { success: true, data: { fileID } }
  } catch (error) {
    console.error('Error generating training QR:', error)
    return { success: false, error: error.message }
  }
}
