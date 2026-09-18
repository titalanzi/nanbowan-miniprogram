/**
 * 飞盘规则页
 * 支持：章节展示、关键字检索、目录跳转、滚动联动
 */
const rulesData = require('../../data/frisbee-rules.js')

Page({
  data: {
    allChapters: [],   // 完整规则数据
    chapters: [],      // 当前展示的（过滤后）数据
    toc: [],           // 目录列表
    keyword: '',
    showToc: false,
    currentChapterId: '',
    tocScrollHeight: 500  // 目录滚动区域高度，px
  },

  // 缓存各章节顶部位置
  _chapterTops: [],
  _lastScrollTop: -1,
  _scrollTimer: null,

  onLoad: function () {
    // 计算目录滚动区域高度（屏幕高度 - header 高度约 55px）
    try {
      const sysInfo = wx.getSystemInfoSync()
      const headerHeight = 55
      this.setData({ tocScrollHeight: sysInfo.windowHeight - headerHeight })
    } catch (e) {
      console.error('Get system info failed:', e)
    }

    const toc = rulesData.map(c => ({
      id: c.id,
      number: c.number,
      title: c.title
    }))

    this.setData({
      allChapters: rulesData,
      chapters: rulesData,
      toc: toc,
      currentChapterId: rulesData[0] ? rulesData[0].id : ''
    })

    // 延迟计算各章节位置
    setTimeout(() => this._calcChapterTops(), 300)
  },

  onUnload: function () {
    if (this._scrollTimer) {
      clearTimeout(this._scrollTimer)
      this._scrollTimer = null
    }
  },

  // 计算各章节距离页面顶部的绝对位置
  _calcChapterTops: function () {
    const chapters = this.data.chapters
    if (!chapters.length) {
      this._chapterTops = []
      return
    }
    const query = wx.createSelectorQuery().in(this)
    chapters.forEach(c => {
      query.select('#chapter-' + c.id).boundingClientRect()
    })
    query.selectViewport().scrollOffset()
    query.exec(res => {
      if (!res) return
      const viewport = res[res.length - 1] || { scrollTop: 0 }
      const scrollTop = viewport.scrollTop || 0
      this._chapterTops = chapters.map((chapter, idx) => ({
        id: chapter.id,
        top: (res[idx] ? res[idx].top : 0) + scrollTop
      }))
    })
  },

  // 页面滚动时更新当前章节
  onPageScroll: function (e) {
    const scrollTop = e.scrollTop
    if (Math.abs(scrollTop - this._lastScrollTop) < 10) return
    this._lastScrollTop = scrollTop

    if (this._scrollTimer) clearTimeout(this._scrollTimer)
    this._scrollTimer = setTimeout(() => {
      this._updateCurrentChapter(scrollTop)
    }, 80)
  },

  _updateCurrentChapter: function (scrollTop) {
    const tops = this._chapterTops
    if (!tops || !tops.length) return

    // 顶部固定栏高度约 110px
    const threshold = 110
    let current = tops[0].id

    for (let i = 0; i < tops.length; i++) {
      if (tops[i].top - threshold <= scrollTop) {
        current = tops[i].id
      } else {
        break
      }
    }

    if (current !== this.data.currentChapterId) {
      this.setData({ currentChapterId: current })
    }
  },

  // 搜索输入
  onSearchInput: function (e) {
    const keyword = e.detail.value.trim().toLowerCase()
    this.setData({ keyword: keyword })
    this.filterChapters(keyword)
  },

  // 清空搜索
  clearSearch: function () {
    this.setData({ keyword: '' })
    this.filterChapters('')
  },

  // 按关键词过滤
  filterChapters: function (keyword) {
    if (!keyword) {
      this.setData({ chapters: this.data.allChapters })
      setTimeout(() => this._calcChapterTops(), 100)
      return
    }

    const filtered = []
    for (const chapter of this.data.allChapters) {
      // 名词定义特殊处理
      if (chapter.isGlossary) {
        const matchedTerms = (chapter.terms || []).filter(t => {
          return (t.term && t.term.toLowerCase().indexOf(keyword) !== -1) ||
                 (t.definition && t.definition.toLowerCase().indexOf(keyword) !== -1)
        })
        if (matchedTerms.length > 0) {
          filtered.push({
            ...chapter,
            terms: matchedTerms
          })
        }
        continue
      }

      // 章节标题或关键词命中 → 整章保留
      const titleHit = chapter.title.toLowerCase().indexOf(keyword) !== -1
      const kwHit = (chapter.keywords || []).some(k => k.toLowerCase().indexOf(keyword) !== -1)

      // 子章节型（17/18/19）
      if (chapter.subChapters) {
        const matchedSubs = []
        for (const sub of chapter.subChapters) {
          const subTitleHit = (sub.title && sub.title.toLowerCase().indexOf(keyword) !== -1)
          const matchedSections = this._filterSections(sub.sections, keyword)
          if (subTitleHit || matchedSections.length > 0) {
            matchedSubs.push({
              num: sub.num,
              title: sub.title,
              sections: titleHit || kwHit ? sub.sections : matchedSections
            })
          }
        }
        if (titleHit || kwHit || matchedSubs.length > 0) {
          filtered.push({
            ...chapter,
            subChapters: titleHit || kwHit ? chapter.subChapters : matchedSubs
          })
        }
        continue
      }

      // 普通章节
      const matchedSections = this._filterSections(chapter.sections, keyword)
      if (titleHit || kwHit || matchedSections.length > 0) {
        filtered.push({
          ...chapter,
          sections: titleHit || kwHit ? chapter.sections : matchedSections
        })
      }
    }

    this.setData({ chapters: filtered })
    setTimeout(() => this._calcChapterTops(), 100)
  },

  // 过滤条文，返回命中的条文（保留子条文）
  _filterSections: function (sections, keyword) {
    if (!sections) return []
    const matched = []
    for (const sec of sections) {
      const textHit = sec.text && sec.text.toLowerCase().indexOf(keyword) !== -1
      const numHit = sec.num && sec.num.toLowerCase().indexOf(keyword) !== -1
      if (textHit || numHit) {
        matched.push(sec)
      } else if (sec.sub) {
        // 检查子条文
        const matchedSubs = sec.sub.filter(sub => {
          return (sub.text && sub.text.toLowerCase().indexOf(keyword) !== -1) ||
                 (sub.num && sub.num.toLowerCase().indexOf(keyword) !== -1)
        })
        if (matchedSubs.length > 0) {
          matched.push({ ...sec, sub: matchedSubs })
        }
      }
    }
    return matched
  },

  // 打开目录
  openToc: function () {
    this.setData({ showToc: true })
  },

  // 关闭目录
  closeToc: function () {
    this.setData({ showToc: false })
  },

  // 点击目录跳转
  scrollToChapter: function (e) {
    const id = e.currentTarget.dataset.id
    if (!id) return

    this.setData({ currentChapterId: id, showToc: false })

    const query = wx.createSelectorQuery().in(this)
    query.select('#chapter-' + id).boundingClientRect()
    query.selectViewport().scrollOffset()
    query.exec(res => {
      if (!res[0] || !res[1]) return
      const offsetTop = res[0].top + res[1].scrollTop - 100
      wx.pageScrollTo({
        scrollTop: offsetTop,
        duration: 200
      })
    })
  },

  // 阻止冒泡
  stopPropagation: function () {},

  // 转发到聊天（不传imageUrl，微信自动截取当前页面快照）
  onShareAppMessage: function () {
    return {
      title: '飞盘规则 - 检索、目录导航全覆盖',
      path: '/pages/frisbee-rules/frisbee-rules'
    }
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    return {
      title: '飞盘规则 - 检索、目录导航全覆盖'
    }
  }
})
