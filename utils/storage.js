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
  const result = await callCloudFunction('getUserFromCloud')
  if (result.success && result.data) {
    return result.data
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

// ============ 智能 set：自动云端双写 ============

async function set(key, value) {
  setLocal(key, value)

  // 对 user 和 matches 自动异步同步到云端
  if (key === 'user') {
    syncUserToCloud(value).catch(err => {
      console.error('Auto sync user failed:', err)
    })
  } else if (key === 'matches' && Array.isArray(value) && value.length > 0) {
    // 只同步最近更新的比赛（避免全量同步）
    const recentMatches = value.filter(m =>
      m.updatedAt &&
      (Date.now() - new Date(m.updatedAt).getTime() < 60000) // 1分钟内有更新的
    )
    for (const match of recentMatches) {
      syncMatchToCloud(match).catch(err => {
        console.error('Auto sync match failed:', match.id, err)
      })
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

      if (result && result.result && result.result.success && result.result.data.length > 0) {
        const cloudMatches = result.result.data
        console.log('Cloud matches count:', cloudMatches.length)

        const localMatches = getLocal('matches') || []
        const deletedMatchIds = getDeletedMatchIds()
        const mergedMatches = [...localMatches]

        for (const cloudMatch of cloudMatches) {
          if (deletedMatchIds.indexOf(cloudMatch.id) !== -1) {
            continue
          }

          const localMatchIndex = mergedMatches.findIndex(m => m.id === cloudMatch.id)
          if (localMatchIndex === -1) {
            if (cloudMatch.status !== 'finished' && cloudMatch.status !== 'deleted') {
              mergedMatches.push(cloudMatch)
            }
          } else {
            const localMatch = mergedMatches[localMatchIndex]

            if (localMatch.status === 'finished' || localMatch.status === 'deleted') {
              continue
            }

            if (cloudMatch.status === 'finished' || cloudMatch.status === 'deleted') {
              mergedMatches[localMatchIndex] = cloudMatch
              continue
            }

            const localUpdated = localMatch.updatedAt ? new Date(localMatch.updatedAt).getTime() : 0
            const cloudUpdated = cloudMatch.updatedAt ? new Date(cloudMatch.updatedAt).getTime() : 0

            if (cloudUpdated > localUpdated) {
              mergedMatches[localMatchIndex] = cloudMatch
            }
          }
        }

        console.log('Merged matches count:', mergedMatches.length)
        setLocal('matches', mergedMatches)
        return mergedMatches
      }
    }
  } catch (e) {
    console.log('Cloud sync error:', e)
  }
  return getLocal('matches') || []
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
        const deletedMatchIds = getDeletedMatchIds()
        const matches = result.result.data.filter(m =>
          m.status !== 'deleted' && deletedMatchIds.indexOf(m.id) === -1
        )
        if (matches.length > 0) {
          setLocal('matches', matches)
        }
        return matches
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

// ============ 导出 ============

module.exports = {
  get: function (key) {
    return getLocal(key)
  },

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

  // 已删除管理
  addDeletedMatchId,
  clearDeletedMatchIds,

  // 节流
  throttledAsync
}
