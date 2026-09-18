const storage = require('../../utils/storage.js')

/**
 * 计算一场比赛触发的羁绊
 * @param {Object} match - 比赛对象，包含 groups[].members[].name
 * @returns {Array} 触发的羁绊列表
 */
function calculateMatchBonds(match) {
  const bonds = storage.getBonds()
  if (!bonds || bonds.length === 0) return []

  // 收集比赛所有队员名字（用 Set 去重，重名只算1人）
  const memberNames = new Set()
  if (match && match.groups) {
    match.groups.forEach(group => {
      if (group.members) {
        group.members.forEach(member => {
          if (member.name) memberNames.add(member.name)
        })
      }
    })
  }

  // 遍历羁绊配置，检查是否触发
  const triggeredBonds = []
  bonds.forEach(bond => {
    if (!bond.members || !bond.requiredCount) return
    // 统计羁绊成员中有多少个在比赛队员名单中
    let matchedCount = 0
    bond.members.forEach(memberName => {
      if (memberNames.has(memberName)) matchedCount++
    })
    // 达到所需人数即触发
    if (matchedCount >= bond.requiredCount) {
      triggeredBonds.push({
        id: bond._id,
        name: bond.name,
        description: bond.description || '',
        imageFileId: bond.imageFileId || '',
        matchedCount: matchedCount,
        totalCount: bond.members.length,
        members: bond.members
      })
    }
  })

  return triggeredBonds
}

/**
 * 获取羁绊图片临时URL（点击标签后调用，懒加载）
 * @param {String} fileID - 云存储 fileID
 * @returns {Promise<String>} 临时URL
 */
async function getBondImageTempUrl(fileID) {
  if (!fileID) return ''
  // 已经是 http 链接直接返回
  if (fileID.indexOf('http') === 0) return fileID
  if (!wx.cloud || !wx.cloud.getTempFileURL) return ''
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [fileID] })
    if (res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
      return res.fileList[0].tempFileURL
    }
  } catch (e) {
    console.log('getBondImageTempUrl failed:', e)
  }
  return ''
}

module.exports = {
  calculateMatchBonds,
  getBondImageTempUrl
}
