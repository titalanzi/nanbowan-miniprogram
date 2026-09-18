/**
 * 飞盘词汇页
 * 支持：按字母分组、右侧字母索引、关键词搜索、点击播放英文发音
 */
const vocabData = require('../../data/frisbee-vocab.js')

Page({
  data: {
    allGroups: [],
    groups: [],
    letters: [],
    keyword: '',
    currentLetter: '',
    playingWord: '',
    showNoteModal: false,
    noteTitle: '',
    noteContent: ''
  },

  // 缓存各字母分段的顶部位置，避免每次滚动都查询节点
  _letterTops: [],
  _lastScrollTop: -1,
  _scrollTimer: null,

  onLoad: function () {
    const letters = vocabData.map(g => g.letter)
    this.setData({
      allGroups: vocabData,
      groups: vocabData,
      letters: letters,
      currentLetter: letters[0] || ''
    })
    // 延迟计算各分段位置，等待渲染完成
    setTimeout(() => this._calcLetterTops(), 300)
  },

  onUnload: function () {
    this._destroyAudio()
    if (this._scrollTimer) {
      clearTimeout(this._scrollTimer)
      this._scrollTimer = null
    }
  },

  // 计算各字母分段距离页面顶部的绝对位置（含滚动偏移）
  _calcLetterTops: function () {
    const letters = this.data.letters
    if (!letters.length) {
      this._letterTops = []
      return
    }
    const query = wx.createSelectorQuery().in(this)
    letters.forEach(l => {
      query.select('#letter-' + l).boundingClientRect()
    })
    query.selectViewport().scrollOffset()
    query.exec(res => {
      if (!res) return
      // 最后一个元素是 viewport 的 scrollOffset
      const viewport = res[res.length - 1] || { scrollTop: 0 }
      const scrollTop = viewport.scrollTop || 0
      this._letterTops = letters.map((letter, idx) => ({
        letter: letter,
        // boundingClientRect.top 是相对视口的位置，加上滚动偏移得到页面绝对位置
        top: (res[idx] ? res[idx].top : 0) + scrollTop
      }))
    })
  },

  // 页面滚动时，更新当前激活的字母
  onPageScroll: function (e) {
    const scrollTop = e.scrollTop
    // 滚动幅度过小则忽略，避免频繁 setData
    if (Math.abs(scrollTop - this._lastScrollTop) < 10) return
    this._lastScrollTop = scrollTop

    // 节流：滚动停止后再计算
    if (this._scrollTimer) clearTimeout(this._scrollTimer)
    this._scrollTimer = setTimeout(() => {
      this._updateCurrentLetter(scrollTop)
    }, 80)
  },

  // 根据滚动位置计算当前激活的字母
  _updateCurrentLetter: function (scrollTop) {
    const tops = this._letterTops
    if (!tops || !tops.length) return

    // 搜索栏高度约 100px，作为判定阈值
    const threshold = 100
    let current = tops[0].letter

    for (let i = 0; i < tops.length; i++) {
      if (tops[i].top - threshold <= scrollTop) {
        current = tops[i].letter
      } else {
        break
      }
    }

    if (current !== this.data.currentLetter) {
      this.setData({ currentLetter: current })
    }
  },

  _destroyAudio: function () {
    if (this.audioCtx) {
      this.audioCtx.stop()
      this.audioCtx.destroy()
      this.audioCtx = null
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    const keyword = e.detail.value.trim().toLowerCase()
    this.setData({ keyword: keyword })
    this.filterGroups(keyword)
  },

  // 清空搜索
  clearSearch: function () {
    this.setData({ keyword: '' })
    this.filterGroups('')
  },

  // 按关键词过滤
  filterGroups: function (keyword) {
    if (!keyword) {
      this.setData({ groups: this.data.allGroups })
      // 重新计算分段位置
      setTimeout(() => this._calcLetterTops(), 100)
      return
    }

    const filtered = []
    for (const group of this.data.allGroups) {
      const matchedWords = group.words.filter(w => {
        return w.en.toLowerCase().indexOf(keyword) !== -1 ||
               w.cn.indexOf(keyword) !== -1
      })
      if (matchedWords.length > 0) {
        filtered.push({
          letter: group.letter,
          words: matchedWords
        })
      }
    }
    this.setData({ groups: filtered })
    // 重新计算分段位置
    setTimeout(() => this._calcLetterTops(), 100)
  },

  // 点击右侧字母索引
  scrollToLetter: function (e) {
    const letter = e.currentTarget.dataset.letter
    if (!letter) return

    this.setData({ currentLetter: letter })

    const query = wx.createSelectorQuery().in(this)
    query.select('#letter-' + letter).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(res => {
      if (!res[0] || !res[1]) return
      const offsetTop = res[0].top + res[1].scrollTop - 80
      wx.pageScrollTo({
        scrollTop: offsetTop,
        duration: 200
      })
    })
  },

  // 播放英文发音：优先使用本地缓存的 fileID，否则调云函数生成并缓存
  playWord: function (e) {
    const word = e.currentTarget.dataset.word
    if (!word) return

    // 再次点击同一个词：若正在播放则停止；若处于异常卡死状态（无 audio 实例）则继续走重新播放以破除死锁
    if (this.data.playingWord === word) {
      if (this.audioCtx) {
        this._destroyAudio()
        this.setData({ playingWord: '' })
        return
      }
      // playingWord 卡住但音频实例已失效，继续往下重新播放
    }

    this.setData({ playingWord: word })
    this._destroyAudio()

    // 1. 检查本地缓存的 fileID
    const cachedFileID = this._getCachedFileID(word)
    if (cachedFileID) {
      this._playAudio(cachedFileID)
      return
    }

    // 2. 缓存未命中，调用云函数获取
    wx.cloud.callFunction({
      name: 'tts',
      data: { text: word },
      success: (res) => {
        const result = res.result || {}
        if (!result.success || !result.audioUrl) {
          this._playFailed(result.message || '语音合成失败')
          return
        }

        // 3. 将 fileID 缓存到本地
        this._cacheFileID(word, result.audioUrl)
        this._playAudio(result.audioUrl)
      },
      fail: () => {
        this._playFailed('语音合成失败')
      }
    })
  },

  // 播放音频（fileID 或 URL 均可）
  // 修复点：
  // 1. cloud:// fileID 先转成临时 https 链接再播放，兼容性最佳
  // 2. 任何失败（onError / play 异常 / 超时）都复位 playingWord，破除"点了没反应"的死锁
  // 3. 用 onCanplay 触发 play，避免 src 未就绪就播放导致静默失败
  _playAudio: function (src) {
    if (!src) {
      this._playFailed('音频地址无效')
      return
    }

    const startPlay = (finalSrc) => {
      try {
        this._destroyAudio()
        const audio = wx.createInnerAudioContext()
        this.audioCtx = audio
        audio.src = finalSrc

        let released = false
        const release = () => {
          if (released) return
          released = true
          this.setData({ playingWord: '' })
          this._destroyAudio()
        }

        audio.onEnded(release)
        audio.onError(release)

        const doPlay = () => {
          try {
            const p = audio.play()
            if (p && typeof p.catch === 'function') {
              p.catch(release)
            }
          } catch (err) {
            release()
          }
        }

        audio.onCanplay(doPlay)
        // 兜底：3 秒内若未触发 onCanplay，直接尝试播放
        setTimeout(() => {
          if (!released) doPlay()
        }, 3000)
      } catch (err) {
        this._playFailed('播放失败')
      }
    }

    // cloud:// fileID 需先转临时 https 链接
    if (typeof src === 'string' && src.indexOf('cloud://') === 0) {
      if (typeof wx.cloud === 'undefined' || !wx.cloud.getTempFileURL) {
        startPlay(src)
        return
      }
      wx.cloud.getTempFileURL({
        fileList: [src],
        success: (res) => {
          const item = (res.fileList && res.fileList[0]) || {}
          if (item.tempFileURL) {
            startPlay(item.tempFileURL)
          } else {
            this._playFailed('音频链接获取失败')
          }
        },
        fail: () => {
          this._playFailed('音频链接获取失败')
        }
      })
    } else {
      startPlay(src)
    }
  },

  // 播放失败的统一收尾：复位状态 + 提示
  _playFailed: function (msg) {
    this.setData({ playingWord: '' })
    this._destroyAudio()
    wx.showToast({ title: msg || '播放失败', icon: 'none' })
  },

  // 从本地缓存获取 fileID
  _getCachedFileID: function (word) {
    try {
      const cache = wx.getStorageSync('tts_cache') || {}
      return cache[word] || ''
    } catch (e) {
      return ''
    }
  },

  // 将 fileID 存入本地缓存
  _cacheFileID: function (word, fileID) {
    try {
      const cache = wx.getStorageSync('tts_cache') || {}
      cache[word] = fileID
      wx.setStorageSync('tts_cache', cache)
    } catch (e) {
      console.error('Cache fileID failed:', e)
    }
  },

  // 显示词汇说明
  showNote: function (e) {
    const title = e.currentTarget.dataset.title
    const content = e.currentTarget.dataset.content
    if (!content) return
    this.setData({
      showNoteModal: true,
      noteTitle: title,
      noteContent: content
    })
  },

  // 关闭说明弹窗
  closeNoteModal: function () {
    this.setData({ showNoteModal: false })
  },

  // 阻止弹窗内容冒泡
  stopPropagation: function () {},

  // 转发到聊天（不传imageUrl，微信自动截取当前页面快照）
  onShareAppMessage: function () {
    return {
      title: '飞盘词汇 - 查词、发音一应俱全',
      path: '/pages/frisbee-vocab/frisbee-vocab'
    }
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    return {
      title: '飞盘词汇 - 查词、发音一应俱全'
    }
  }
})
