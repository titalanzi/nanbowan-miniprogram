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

  onLoad: function () {
    const letters = vocabData.map(g => g.letter)
    this.setData({
      allGroups: vocabData,
      groups: vocabData,
      letters: letters,
      currentLetter: letters[0] || ''
    })
  },

  onUnload: function () {
    this._destroyAudio()
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

  // 播放英文发音：通过云函数调用腾讯云 TTS，支持多词连读
  playWord: function (e) {
    const word = e.currentTarget.dataset.word
    if (!word) return

    this.setData({ playingWord: word })
    this._destroyAudio()

    wx.cloud.callFunction({
      name: 'tts',
      data: { text: word },
      success: (res) => {
        const result = res.result || {}
        if (!result.success || !result.audioUrl) {
          this.setData({ playingWord: '' })
          wx.showToast({
            title: result.message || '语音合成失败',
            icon: 'none'
          })
          return
        }

        const audio = wx.createInnerAudioContext()
        audio.src = result.audioUrl
        audio.onEnded(() => {
          this.setData({ playingWord: '' })
          this._destroyAudio()
        })
        audio.onError(() => {
          this.setData({ playingWord: '' })
          this._destroyAudio()
        })
        audio.play()
        this.audioCtx = audio
      },
      fail: () => {
        this.setData({ playingWord: '' })
        wx.showToast({ title: '语音合成失败', icon: 'none' })
      }
    })
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
  stopPropagation: function () {}
})
