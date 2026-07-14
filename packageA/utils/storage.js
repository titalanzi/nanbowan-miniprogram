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

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.log('Cloud function timeout')
      resolve(null)
    }, ms)
    promise.then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        clearTimeout(timer)
        console.log('Cloud function error:', error)
        resolve(null)
      }
    )
  })
}

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

async function syncMatches() {
  try {
    if (typeof wx.cloud !== 'undefined' && wx.cloud.callFunction) {
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchesFromCloud'
      }), 3000)
      
      if (result && result.result && result.result.success && result.result.data.length > 0) {
        const cloudMatches = result.result.data
        console.log('Cloud matches count:', cloudMatches.length)
        cloudMatches.forEach(m => console.log('Cloud match:', m.id, 'status:', m.status, 'updatedAt:', m.updatedAt))
        
        const localMatches = getLocal('matches') || []
        console.log('Local matches count:', localMatches.length)
        
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
    if (typeof wx.cloud !== 'undefined' && wx.cloud.callFunction) {
      console.log('Calling getMatchesFromCloud function...')
      const result = await withTimeout(wx.cloud.callFunction({
        name: 'getMatchesFromCloud'
      }), 3000)
      
      if (result && result.result && result.result.success) {
        console.log('Got matches from cloud, count:', result.result.data.length)
        const deletedMatchIds = getDeletedMatchIds()
        return result.result.data.filter(m => 
          m.status !== 'deleted' && deletedMatchIds.indexOf(m.id) === -1
        )
      }
    }
  } catch (e) {
    console.error('Cloud sync error:', e)
  }
  return []
}

module.exports = {
  get: function(key) {
    return getLocal(key)
  },
  
  set: function(key, value) {
    setLocal(key, value)
    return true
  },
  
  setLocal,
  
  remove,
  clear,
  generateId,
  syncMatches,
  getMatchesFromCloudOnly,
  addDeletedMatchId,
  clearDeletedMatchIds
}