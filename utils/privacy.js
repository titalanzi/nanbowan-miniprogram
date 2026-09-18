/**
 * 隐私授权工具
 * 配合 app.json 中的 __usePrivacyCheck__ 使用
 * 
 * 不注册自定义 onNeedPrivacyAuthorization 回调，
 * 让微信使用官方默认的隐私授权弹窗，更稳定可靠。
 */

/**
 * 初始化隐私授权
 * 不注册自定义回调，使用微信官方默认弹窗
 */
function setupPrivacyAuthorization() {
  // 微信官方文档：如果开发者未调用 wx.onNeedPrivacyAuthorization 注册回调函数，
  // 则默认弹出微信官方的隐私授权弹窗。
  // 这里不做任何注册，让微信处理。
  console.log('隐私授权使用微信官方默认弹窗')
}

/**
 * 主动检查是否已授权隐私协议
 * 可在需要提前判断的场景调用
 * @returns {Promise<boolean>} true 表示已授权或无需授权
 */
function checkPrivacyAuthorized() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) {
      // 基础库版本过低，默认放行
      resolve(true)
      return
    }

    wx.getPrivacySetting({
      success(res) {
        resolve(!res.needAuthorization)
      },
      fail() {
        resolve(true)
      }
    })
  })
}

module.exports = {
  setupPrivacyAuthorization,
  checkPrivacyAuthorized
}
