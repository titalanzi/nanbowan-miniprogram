const STORAGE_PREFIX = 'nbw_'

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

function timeoutPromise(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('timeout'))
    }, timeoutMs)
    promise.then(
      (result) => {
        clearTimeout(timeout)
        resolve(result)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

async function callCloudFunction(name, data = {}) {
  if (typeof wx.cloud === 'undefined' || !wx.cloud.callFunction) {
    return { success: false, message: 'Cloud not available' }
  }
  
  try {
    const result = await timeoutPromise(
      wx.cloud.callFunction({ name, data }),
      10000
    )
    return result.result
  } catch (error) {
    console.log(`Cloud function ${name} not available, using local`)
    return { success: false, message: error.message }
  }
}

async function getUserFromCloud() {
  const result = await callCloudFunction('getUserFromCloud')
  if (result.success) {
    return result.data
  }
  return null
}

async function syncUserToCloud(user) {
  const result = await callCloudFunction('syncUser', { user })
  return result.success
}

async function getMatchesFromCloud(status) {
  const result = await callCloudFunction('getMatchesFromCloud', { status })
  if (result.success) {
    return result.data
  }
  return []
}

async function syncMatchToCloud(match) {
  const result = await callCloudFunction('syncMatch', { match })
  return result.success
}

module.exports = {
  get: async function(key) {
    return getLocal(key)
  },
  
  set: async function(key, value) {
    setLocal(key, value)
    
    if (key === 'user') {
      setTimeout(() => {
        syncUserToCloud(value).catch(() => {})
      }, 0)
    } else if (key === 'matches' && value.length > 0) {
      setTimeout(() => {
        value.forEach(match => {
          syncMatchToCloud(match).catch(() => {})
        })
      }, 0)
    }
    
    return true
  },
  
  remove: function(key) {
    try {
      wx.removeStorageSync(STORAGE_PREFIX + key)
      return true
    } catch (e) {
      console.error('Storage remove error:', e)
      return false
    }
  },
  
  clear: function() {
    try {
      wx.clearStorageSync()
      return true
    } catch (e) {
      console.error('Storage clear error:', e)
      return false
    }
  },
  
  generateId: function() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  },
  
  syncMatches: async function() {
    try {
      const cloudMatches = await getMatchesFromCloud()
      if (cloudMatches && cloudMatches.length > 0) {
        setLocal('matches', cloudMatches)
        return cloudMatches
      }
    } catch (e) {
      console.log('Cloud sync not available')
    }
    return getLocal('matches') || []
  },
  
  initCloud: function(envId) {
    if (typeof wx.cloud !== 'undefined') {
      wx.cloud.init({
        env: envId,
        traceUser: true
      })
    }
  }
}