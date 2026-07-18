const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { code } = event
  const wxContext = cloud.getWXContext()

  if (!code) {
    return { success: false, message: '验证码不能为空' }
  }

  try {
    const db = cloud.database()
    const result = await db.collection('assistant_codes')
      .where({ code: code, active: true })
      .get()

    if (result.data && result.data.length > 0) {
      return {
        success: true,
        message: '验证成功',
        data: { role: 'assistant' }
      }
    }

    return { success: false, message: '验证码无效' }
  } catch (e) {
    console.error('verifyAssistantCode error:', e)
    return { success: false, message: '验证失败，请稍后重试' }
  }
}
