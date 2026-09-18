const STORAGE_PREFIX = 'nbw_'

// ============ 基础本地存储 ============

function getLocal(key) {
  try {
    const data = wx.getStorageSync(STORAGE_PREFIX + key)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error('Storage get error:', e)
    return null
  }
}

function setLocal(key, value) {
  try {
    wx.setStorageSync(STORAGE_PREFIX + key, JSON.stringify(value))
    return true
  } catch (e) {
    console.error('Storage set error:', e)
    return false
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(STORAGE_PREFIX + key)
    return true
  } catch (e) {
    console.error('Storage remove error:', e)
    return false
  }
}

function clear() {
  try {
    wx.clearStorageSync()
    return true
  } catch (e) {
    console.error('Storage clear error:', e)
    return false
  }
}

function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// ============ 超时处理 ============

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Cloud function timeout after ' + ms + 'ms'))
    }, ms)
    promise.then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

// ============ 已删除比赛 ID 管理 ============

function getDeletedMatchIds() {
  try {
    const data = wx.getStorageSync(STORAGE_PREFIX + 'deletedMatchIds')
    return data ? JSON.parse(data) : []
  } catch (e) {
    return []
  }
}

function addDeletedMatchId(matchId) {
  try {
    const deletedIds = getDeletedMatchIds()
    if (deletedIds.indexOf(matchId) === -1) {
      deletedIds.push(matchId)
      wx.setStorageSync(STORAGE_PREFIX + 'deletedMatchIds', JSON.stringify(deletedIds))
    }
    return true
  } catch (e) {
    console.error('Add deleted match id error:', e)
    return false
  }
}

function clearDeletedMatchIds() {
  try {
    wx.removeStorageSync(STORAGE_PREFIX + 'deletedMatchIds')
    return true
  } catch (e) {
    return false
  }
}

// ============ 云函数调用 ============

function isCloudAvailable() {
  return typeof wx.cloud !== 'undefined' && wx.cloud.callFunction
}

async function callCloudFunction(name, data = {}, timeoutMs = 10000) {
  if (!isCloudAvailable()) {
    return { success: false, message: 'Cloud not available' }
  }

  try {
    const result = await withTimeout(
      wx.cloud.callFunction({ name, data }),
      timeoutMs
    )
    return result.result
  } catch (error) {
    console.error('Cloud function ' + name + ' error:', error.message || error)
    return { success: false, message: error.message || 'Cloud function failed' }
  }
}

async function getUserFromCloud() {
  try {
    const result = await callCloudFunction('getUserFromCloud')
    if (result && result.success && result.data) {
      const user = result.data
      if (!user.id && user._id) {
        user.id = user._id
      }
      console.log('getUserFromCloud - 获取用户成功, id:', user.id)
      return user
    } else {
      console.log('getUserFromCloud - 返回结果:', JSON.stringify(result))
    }
  } catch (e) {
    console.error('getUserFromCloud error:', e)
  }
  return null
}

async function syncUserToCloud(user) {
  const result = await callCloudFunction('syncUser', { user })
  return result.success
}

// ============ 云存储：头像上传 ============

async function getOpenIdSafe() {
  try {
    if (isCloudAvailable()) {
      const res = await withTimeout(wx.cloud.callFunction({ name: 'getOpenId' }), 5000)
      if (res && res.result && res.result.openid) {
        return res.result.openid
      }
    }
  } catch (e) {
    console.error('Get openid failed:', e)
  }
  return 'anon'
}

  // 压缩图片至目标体积（KB），返回压缩后的临时文件路径
  // quality 从 80 逐步降到 40，保证 ≥ 40 的最低可接受质量
  async function compressImage(src, targetKB) {
    if (!src || !wx.compressImage) {
      return src
    }
    const qualities = [80, 60, 40]
    for (const quality of qualities) {
      try {
        const res = await new Promise((resolve, reject) => {
          wx.compressImage({
            src: src,
            quality: quality,
            success: resolve,
            fail: reject
          })
        })
        // 检查压缩后文件大小
        const info = await new Promise((resolve, reject) => {
          wx.getFileInfo({
            filePath: res.tempFilePath,
            success: resolve,
            fail: reject
          })
        })
        const sizeKB = (info.size || 0) / 1024
        if (sizeKB <= targetKB || quality === qualities[qualities.length - 1]) {
          return res.tempFilePath
        }
      } catch (e) {
        if (quality === qualities[qualities.length - 1]) {
          return src
        }
      }
    }
    return src
  }

  // 将临时头像文件上传到云存储，返回 cloud://fileID
  // 失败时回退返回原始临时路径，保证注册/编辑流程不中断
  async function uploadAvatarToCloud(tempFilePath, openid) {
    if (!tempFilePath) return ''

    // 已经是云存储 fileID（持久），直接复用；本地路径 / 临时 http 均需上传
    if (tempFilePath.indexOf('cloud://') === 0) {
      return tempFilePath
    }

    if (!isCloudAvailable() || !wx.cloud.uploadFile) {
      return tempFilePath
    }

  try {
    const uid = openid || (await getOpenIdSafe())
    const ext = (tempFilePath.split('.').pop() || 'png').split('?')[0] || 'png'
    const cloudPath = 'avatars/' + uid + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext
    const res = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
    if (res && res.fileID) {
      return res.fileID
    }
  } catch (e) {
    console.error('Upload avatar to cloud failed:', e)
  }
  // 上传失败兜底：保留临时路径
  return tempFilePath
}

async function syncMatchToCloud(match) {
  const result = await callCloudFunction('syncMatch', { match })
  return result.success
}

// ============ 纯云端 set：直接同步到云端 ============

async function set(key, value) {
  if (key === 'user') {
    await syncUserToCloud(value)
  } else if (key === 'matches' && Array.isArray(value) && value.length > 0) {
    const recentMatches = value.filter(m =>
      m.updatedAt &&
      (Date.now() - new Date(m.updatedAt).getTime() < 60000)
    )
    for (const match of recentMatches) {
      await syncMatchToCloud(match)
    }
  }

  return true
}

// ============ 比赛同步 ============

async function syncMatches() {
  try {
    if (isCloudAvailable()) {
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchesFromCloud'
      }), 3000)

      if (result && result.result && result.result.success) {
        const cloudMatches = result.result.data
        console.log('Cloud matches count:', cloudMatches.length)
        return cloudMatches.filter(m => m.status !== 'deleted')
      }
    }
  } catch (e) {
    console.log('Cloud sync error:', e)
  }
  return []
}

async function getMatchesFromCloudOnly() {
  try {
    if (isCloudAvailable()) {
      console.log('Calling getMatchesFromCloud function...')
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchesFromCloud'
      }), 10000)

      if (result && result.result && result.result.success) {
        console.log('Got matches from cloud, count:', result.result.data.length)
        return result.result.data.filter(m => m.status !== 'deleted')
      } else {
        console.log('Cloud function returned unsuccessful:', result)
      }
    } else {
      console.log('wx.cloud not available')
    }
  } catch (e) {
    console.error('Cloud sync error:', e)
  }
  return []
}

// 按状态从云端获取比赛（云端过滤，减少数据传输）
async function getMatchesFromCloudByStatus(status) {
  try {
    if (isCloudAvailable()) {
      console.log('Calling getMatchesFromCloud function with status:', status)
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchesFromCloud',
        data: { status }
      }), 10000)

      if (result && result.result && result.result.success) {
        console.log('Got matches from cloud, count:', result.result.data.length)
        return result.result.data.filter(m => m.status !== 'deleted')
      } else {
        console.log('Cloud function returned unsuccessful:', result)
      }
    } else {
      console.log('wx.cloud not available')
    }
  } catch (e) {
    console.error('Cloud sync error:', e)
  }
  return []
}

// 分页获取比赛（status 过滤 + skip/limit），返回 { list, hasMore }
// hasMore 基于云端返回的原始条数判断：等于 limit 说明可能还有下一页
async function getMatchesPaged(status, skip = 0, limit = 5) {
  try {
    if (isCloudAvailable()) {
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchesFromCloud',
        data: { status, skip, limit }
      }), 10000)

      if (result && result.result && result.result.success) {
        const raw = (result.result.data) || []
        const list = raw.filter(m => m.status !== 'deleted')
        return { list, hasMore: raw.length >= limit }
      } else {
        console.log('getMatchesPaged cloud returned unsuccessful:', result)
      }
    } else {
      console.log('wx.cloud not available')
    }
  } catch (e) {
    console.error('getMatchesPaged error:', e)
  }
  return { list: [], hasMore: false }
}

// 按 ID 从云端查询单场比赛数据
async function getMatchByIdFromCloud(matchId) {
  try {
    if (isCloudAvailable()) {
      console.log('Calling getMatchById function...', matchId)
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchById',
        data: { matchId }
      }), 10000)

      if (result && result.result && result.result.success) {
        console.log('Got match from cloud:', matchId)
        return result.result.data
      } else {
        console.log('Cloud function returned unsuccessful:', result)
      }
    }
  } catch (e) {
    console.error('getMatchById error:', e)
  }
  return null
}

// ============ 队训数据同步 ============

async function syncTrainingToCloud(training) {
  try {
    if (isCloudAvailable()) {
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'syncTraining',
        data: { training }
      }), 10000)
      return result && result.result && result.result.success
    }
  } catch (e) {
    console.error('Training sync error:', e)
  }
  return false
}

async function getTrainingsFromCloud(status) {
  try {
    if (isCloudAvailable()) {
      console.log('Calling getTrainingList function, status:', status)
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getTrainingList',
        data: { status }
      }), 10000)

      if (result && result.result && result.result.success) {
        console.log('Got trainings from cloud, count:', result.result.data.length)
        return result.result.data
      } else {
        console.log('Training cloud function returned unsuccessful:', result)
      }
    } else {
      console.log('wx.cloud not available')
    }
  } catch (e) {
    console.error('Training cloud sync error:', e)
  }
  return []
}

async function getMyTrainingsFromCloud() {
  try {
    if (isCloudAvailable()) {
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMyTrainings'
      }), 10000)

      if (result && result.result && result.result.success) {
        return result.result.data
      }
    }
  } catch (e) {
    console.error('Get my trainings error:', e)
  }
  return []
}

async function getTrainingDetailFromCloud(trainingId) {
  try {
    if (isCloudAvailable()) {
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getTrainingDetail',
        data: { trainingId }
      }), 10000)

      if (result && result.result && result.result.success) {
        return result.result.data
      }
    }
  } catch (e) {
    console.error('Get training detail error:', e)
  }
  return null
}

// ============ Banner 缓存管理 ============

const BANNER_CACHE_KEY = 'banners_cache'
const BANNER_CACHE_TTL = 604800000

function getBannersCache() {
  try {
    const data = wx.getStorageSync(STORAGE_PREFIX + BANNER_CACHE_KEY)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error('Get banners cache error:', e)
    return null
  }
}

function setBannersCache(banners) {
  try {
    const cache = {
      data: banners,
      timestamp: Date.now()
    }
    wx.setStorageSync(STORAGE_PREFIX + BANNER_CACHE_KEY, JSON.stringify(cache))
    return true
  } catch (e) {
    console.error('Set banners cache error:', e)
    return false
  }
}

function isBannersCacheValid() {
  const cache = getBannersCache()
  if (!cache || !cache.data || cache.data.length === 0) {
    return false
  }
  return Date.now() - cache.timestamp < BANNER_CACHE_TTL
}

function getCachedBanners() {
  const cache = getBannersCache()
  return cache && cache.data ? cache.data : []
}

function clearBannersCache() {
  try {
    wx.removeStorageSync(STORAGE_PREFIX + BANNER_CACHE_KEY)
    return true
  } catch (e) {
    console.error('Clear banners cache error:', e)
    return false
  }
}

// ============ 羁绊配置缓存 ============

const BONDS_CACHE_KEY = 'bonds_cache'
const BONDS_CACHE_TTL = 86400000 // 24小时

function getBondsCache() {
  try {
    const data = wx.getStorageSync(STORAGE_PREFIX + BONDS_CACHE_KEY)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error('Get bonds cache error:', e)
    return null
  }
}

function setBondsCache(bonds) {
  try {
    const cache = {
      data: bonds,
      timestamp: Date.now()
    }
    wx.setStorageSync(STORAGE_PREFIX + BONDS_CACHE_KEY, JSON.stringify(cache))
    return true
  } catch (e) {
    console.error('Set bonds cache error:', e)
    return false
  }
}

function isBondsCacheValid() {
  const cache = getBondsCache()
  if (!cache || !cache.data) return false
  return Date.now() - cache.timestamp < BONDS_CACHE_TTL
}

function getBonds() {
  const cache = getBondsCache()
  return cache && cache.data ? cache.data : []
}

async function syncBonds() {
  try {
    if (!isCloudAvailable()) {
      return getBonds()
    }
    const result = await withTimeout(wx.cloud.callFunction({
      name: 'getBonds'
    }), 5000)

    if (result && result.result && result.result.success) {
      setBondsCache(result.result.data)
      return result.result.data
    }
    return getBonds()
  } catch (e) {
    console.log('syncBonds failed, use cache:', e)
    return getBonds()
  }
}

// ============ 节流工具 ============

const throttleMap = {}

function throttledAsync(key, fn, minIntervalMs) {
  const now = Date.now()
  const lastRun = throttleMap[key] || 0
  if (now - lastRun < minIntervalMs) {
    return null // 表示被节流跳过
  }
  throttleMap[key] = now
  return fn()
}

// ============ 纯云端 get ============

async function get(key) {
  if (key === 'user') {
    return getUserFromCloud() || {}
  } else if (key === 'matches') {
    return getMatchesFromCloudOnly()
  }
  return getLocal(key)
}

// ============ 战术板 ============

async function saveTacticToCloud(tacticData, code) {
  return await callCloudFunction('saveTactic', { tacticData, code })
}

async function getTacticFromCloud(code) {
  return await callCloudFunction('getTactic', { code })
}

// ============ 导出 ============

module.exports = {
  get,

  set,

  setLocal,

  remove,
  clear,
  generateId,

  // 云函数
  callCloudFunction,
  isCloudAvailable,
  getUserFromCloud,
  syncUserToCloud,
  syncMatchToCloud,

  // 云存储
  uploadAvatarToCloud,
  getOpenIdSafe,
  compressImage,

  // 比赛同步
  syncMatches,
  getMatchesFromCloudOnly,
  getMatchesFromCloudByStatus,
  getMatchesPaged,
  getMatchByIdFromCloud,

  // 队训同步
  syncTrainingToCloud,
  getTrainingsFromCloud,
  getMyTrainingsFromCloud,
  getTrainingDetailFromCloud,

  // 已删除管理
  addDeletedMatchId,
  clearDeletedMatchIds,

  // 节流
  throttledAsync,

  // Banner 缓存
  isBannersCacheValid,
  getCachedBanners,
  setBannersCache,
  clearBannersCache,

  // 羁绊配置缓存
  syncBonds,
  getBonds,
  isBondsCacheValid,
  setBondsCache,

  // 战术板
  saveTacticToCloud,
  getTacticFromCloud
}
