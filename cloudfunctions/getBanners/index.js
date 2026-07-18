const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloudbase-d1gy9zpsb97f7c289' })

const ENV = 'cloudbase-d1gy9zpsb97f7c289'
const ENV_PREFIX = 'cloudbase-d1gy9zpsb97f7c289.636c-cloudbase-d1gy9zpsb97f7c289-1438962250'
const MAX_BANNERS = 5

// 读取云存储 banners/ 目录下 banner_1.jpg ~ banner_5.jpg
// 管理员直接在云开发控制台替换对应文件即可更新活动页 banner
exports.main = async (event, context) => {
  try {
    const fileIDs = []
    for (let i = 1; i <= MAX_BANNERS; i++) {
      fileIDs.push('cloud://' + ENV_PREFIX + '/banners/banner_' + i + '.jpg')
    }

    const res = await cloud.getTempFileURL({ fileList: fileIDs })

    const banners = []
    if (res && res.fileList) {
      for (const item of res.fileList) {
        // status === 0 表示文件存在且获取成功
        if (item.status === 0 && item.tempFileURL) {
          banners.push({ tempFileURL: item.tempFileURL })
        }
      }
    }

    return { success: true, data: banners }
  } catch (error) {
    console.error('getBanners error:', error)
    return { success: false, data: [], message: error.message || '获取 banner 失败' }
  }
}
