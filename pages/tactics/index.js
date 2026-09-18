const COLORS = {
  BLUE: '#3498DB',
  RED: '#E74C3C',
  DISC: '#F59E0B',
  GRID: '#E5E7EB',
  PATH_BLUE: '#3498DB',
  PATH_RED: '#E74C3C',
  PATH_DISC: '#F59E0B',
  TARGET: '#9CA3AF'
}

const PLAYER_RADIUS = 12
const DISC_RADIUS = 10
const MARKER_SIZE = 14
const MIN_DISTANCE = 0.04 // 归一化坐标下最小间距，防止重叠

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(deepClone)
  const copy = {}
  for (const key in obj) copy[key] = deepClone(obj[key])
  return copy
}

Page({
  data: {
    tacticName: '新战术',
    isViewMode: false,
    saveStatusText: '已保存',
    isPlaying: false,
    currentIndex: 0,
    steps: [],
    bluePlayers: [],
    redPlayers: [],
    draggingItem: null,
    dragX: 0,
    dragY: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    statusBarHeight: 20,
    shareImage: '',
    tacticId: '',
    loadingTactic: false,
    showDescModal: false,
    descEditing: '',
    currentStepDesc: ''
  },

  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _scale: 1,
  _history: [],
  _historyIndex: -1,
  _playingTimer: null,
  _animating: false,
  _animProgress: 0,
  _animFromIdx: 0,
  _animToIdx: 1,
  _draggingItem: null,
  _dragStartPlayer: null,
  _touchStartTime: 0,
  _longPressTriggered: false,
  _onFieldIds: new Set(),

  onLoad(options) {
    try {
      const sysInfo = wx.getSystemInfoSync()
      this.setData({ statusBarHeight: sysInfo.statusBarHeight || 20 })
    } catch (e) {
      // ignore
    }

    // 从分享链接进入，加载他人分享的战术数据
    if (options.from === 'share') {
      try {
        const shared = wx.getStorageSync('sharedTactic')
        wx.removeStorageSync('sharedTactic')
        if (shared && shared.steps) {
          this._loadSharedTactic(shared)
          return
        }
      } catch (e) {
        console.error('Load shared tactic failed:', e)
      }
    }

    const tacticId = options.id
    if (tacticId) {
      this.setData({ tacticId, loadingTactic: true })
      this._loadTactic(tacticId)
    } else {
      this._initNewTactic()
      // 新建战术延迟自动保存一次，确保分享按钮可拿到 tacticId
      setTimeout(() => {
        if (!this.data.tacticId) {
          this._saveTactic()
        }
      }, 800)
    }
  },

  onReady() {
    this._initCanvas()
  },

  onUnload() {
    if (this._playingTimer) {
      clearInterval(this._playingTimer)
      this._playingTimer = null
    }
  },

  _initNewTactic() {
    const steps = this._createDefaultSteps()
    const bluePlayers = this._buildInventory('blue')
    const redPlayers = this._buildInventory('red')

    const tacticName = '新战术'
    const stepsData = steps.map((s, i) => ({
      id: s.id,
      number: i + 1,
      playerPositions: s.playerPositions,
      discPosition: s.discPosition,
      description: s.description || ''
    }))

    this._pushHistory()
    this.setData({
      tacticName,
      steps: stepsData,
      currentIndex: 0,
      currentStepDesc: stepsData[0] ? stepsData[0].description : '',
      bluePlayers,
      redPlayers,
      saveStatusText: '编辑中'
    })

    setTimeout(() => {
      this._markDefaultOnField(stepsData[0])
      // 布局稳定后重新初始化 canvas，修正 onReady 时获取到的错误尺寸
      this._initCanvas()
    }, 100)
  },

  // 从分享链接加载战术数据，作为新战术打开（无 tacticId，保存时生成新的）
  _loadSharedTactic(shared) {
    const steps = (shared.steps || []).map((s, i) => ({
      id: s.id || ('step_' + Date.now() + '_' + i),
      number: i + 1,
      playerPositions: s.playerPositions || [],
      discPosition: s.discPosition,
      description: s.description || ''
    }))

    const bluePlayers = this._buildInventory('blue')
    const redPlayers = this._buildInventory('red')

    const onFieldIds = new Set()
    steps[0] && steps[0].playerPositions.forEach(p => onFieldIds.add(p.id))
    this._onFieldIds = onFieldIds

    this._pushHistory()
    this.setData({
      tacticName: shared.name || '分享的战术',
      steps,
      currentIndex: shared.currentIndex || 0,
      currentStepDesc: steps[0] ? (steps[0].description || '') : '',
      bluePlayers: bluePlayers.map(p => ({ ...p, onField: onFieldIds.has(p.id) })),
      redPlayers: redPlayers.map(p => ({ ...p, onField: onFieldIds.has(p.id) })),
      saveStatusText: '编辑中',
      tacticId: ''
    })

    setTimeout(() => {
      this._initCanvas()
    }, 100)
  },

  _createDefaultSteps() {
    const pos = [
      { id: 'O1', x: 0.35, y: 0.20, color: 'blue' },
      { id: 'O2', x: 0.65, y: 0.20, color: 'blue' },
      { id: 'R1', x: 0.35, y: 0.80, color: 'red' },
      { id: 'R2', x: 0.65, y: 0.80, color: 'red' }
    ]
    const discPos = { x: 0.50, y: 0.80 }

    return [
      {
        id: genId('step'),
        playerPositions: deepClone(pos),
        discPosition: deepClone(discPos)
      }
    ]
  },

  _buildInventory(color) {
    // 每侧仅 1 个“添加”源棋子；拖拽落点时按当前步骤同色数量自动编号（蓝 O1/O2... 红 R1/R2...）
    const list = []
    list.push({
      id: color + '_src',
      label: '＋',
      color: color,
      onField: false
    })
    return list
  },

  _markDefaultOnField(step0) {
    const onFieldIds = new Set()
    step0.playerPositions.forEach(p => onFieldIds.add(p.id))
    this._onFieldIds = onFieldIds

    const bluePlayers = this.data.bluePlayers.map(p => ({
      ...p,
      onField: onFieldIds.has(p.id)
    }))
    const redPlayers = this.data.redPlayers.map(p => ({
      ...p,
      onField: onFieldIds.has(p.id)
    }))
    this.setData({ bluePlayers, redPlayers })
  },

  _loadTactic(id) {
    wx.cloud.callFunction({
      name: 'getTactic',
      data: { id }
    }).then(res => {
      const result = res.result || {}
      if (!result.success || !result.data) {
        this.setData({ loadingTactic: false })
        wx.showToast({ title: result.message || '战术不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      const tactic = result.data
      const steps = (tactic.steps || []).map((s, i) => ({
        id: s.id || ('step_' + i),
        number: i + 1,
        playerPositions: s.playerPositions || [],
        discPosition: s.discPosition,
        description: s.description || ''
      }))

      const bluePlayers = this._buildInventory('blue')
      const redPlayers = this._buildInventory('red')
      const onFieldIds = new Set()
      steps[0] && steps[0].playerPositions.forEach(p => onFieldIds.add(p.id))
      this._onFieldIds = onFieldIds

      this.setData({
        tacticName: tactic.name || '新战术',
        steps,
        currentIndex: 0,
        currentStepDesc: steps[0] ? (steps[0].description || '') : '',
        bluePlayers: bluePlayers.map(p => ({ ...p, onField: onFieldIds.has(p.id) })),
        redPlayers: redPlayers.map(p => ({ ...p, onField: onFieldIds.has(p.id) })),
        saveStatusText: '已保存',
        loadingTactic: false
      })
      this._pushHistory()
      // 重新初始化 canvas，确保尺寸与当前布局匹配
      setTimeout(() => this._initCanvas(), 50)
    }).catch(err => {
      console.error('Load tactic error:', err)
      this.setData({ loadingTactic: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    })
  },

  _initCanvas() {
    const query = wx.createSelectorQuery()
    query.select('#tacticsCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0]) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        const w = res[0].width
        const h = res[0].height
        if (!w || !h) {
          // canvas 尺寸还没准备好，延迟重试
          setTimeout(() => this._initCanvas(), 100)
          return
        }
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)
        this._canvas = canvas
        this._ctx = ctx
        this._dpr = dpr
        this.setData({ canvasWidth: w, canvasHeight: h })
        this._draw(w, h)
      })
  },

  _draw(dw, dh) {
    const ctx = this._ctx
    const w = dw || this.data.canvasWidth
    const h = dh || this.data.canvasHeight
    if (!ctx || !w || !h) return

    const currentStep = this.data.steps[this.data.currentIndex]
    if (!currentStep) return

    ctx.clearRect(0, 0, w, h)

    this._drawGrid(ctx, w, h)
    this._drawField(ctx, w, h)

    // Draw paths from previous step to current step
    if (this.data.currentIndex > 0 && !this._animating) {
      this._drawPaths(ctx, w, h)
    }

    // Draw players first
    currentStep.playerPositions.forEach(pos => {
      this._drawPlayer(ctx, pos, w, h)
    })

    // Draw disc on top (always top layer)
    this._drawDisc(ctx, currentStep.discPosition, w, h)
  },

  _drawGrid(ctx, w, h) {
    const field = this._getFieldRect(w, h)
    const { x: fx, y: fy, w: fw, h: fh } = field
    ctx.save()
    ctx.beginPath()
    ctx.rect(fx, fy, fw, fh)
    ctx.clip()

    ctx.strokeStyle = COLORS.GRID
    ctx.lineWidth = 0.5
    const gridSize = 30
    for (let x = fx; x <= fx + fw; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, fy)
      ctx.lineTo(x, fy + fh)
      ctx.stroke()
    }
    for (let y = fy; y <= fy + fh; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(fx, y)
      ctx.lineTo(fx + fw, y)
      ctx.stroke()
    }
    ctx.restore()
  },

  _getFieldRect(w, h) {
    // 标准飞盘场地比例 100:55 (高:宽)
    const ratio = 100 / 55
    let fieldH, fieldW
    if (h / w > ratio) {
      fieldW = w
      fieldH = w * ratio
    } else {
      fieldH = h
      fieldW = h / ratio
    }
    // 居中
    const offsetX = (w - fieldW) / 2
    const offsetY = (h - fieldH) / 2
    return { x: offsetX, y: offsetY, w: fieldW, h: fieldH }
  },

  _drawField(ctx, w, h) {
    const field = this._getFieldRect(w, h)
    const { x: fx, y: fy, w: fw, h: fh } = field

    // 得分区高度 = 总高度的 20%
    const endZoneH = fh * 0.20

    // 1. 整体背景（比赛区域 - 浅绿）
    ctx.fillStyle = '#E8F5E9'
    ctx.fillRect(fx, fy, fw, fh)

    // 2. 上方得分区（深一点绿）
    ctx.fillStyle = '#C8E6C9'
    ctx.fillRect(fx, fy, fw, endZoneH)

    // 3. 下方得分区
    ctx.fillStyle = '#C8E6C9'
    ctx.fillRect(fx, fy + fh - endZoneH, fw, endZoneH)

    // 4. 外边界线
    ctx.strokeStyle = '#2E7D32'
    ctx.lineWidth = 2
    ctx.strokeRect(fx, fy, fw, fh)

    // 5. 得分区线（上下各一条横线）
    ctx.strokeStyle = '#2E7D32'
    ctx.lineWidth = 2
    // 上得分区底线
    ctx.beginPath()
    ctx.moveTo(fx, fy + endZoneH)
    ctx.lineTo(fx + fw, fy + endZoneH)
    ctx.stroke()
    // 下得分区底线
    ctx.beginPath()
    ctx.moveTo(fx, fy + fh - endZoneH)
    ctx.lineTo(fx + fw, fy + fh - endZoneH)
    ctx.stroke()

    // 6. 中线
    ctx.strokeStyle = '#2E7D32'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(fx, fy + fh / 2)
    ctx.lineTo(fx + fw, fy + fh / 2)
    ctx.stroke()

    // 7. 得分区标签
    ctx.fillStyle = 'rgba(46, 125, 50, 0.3)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('END ZONE', fx + fw / 2, fy + endZoneH / 2)
    ctx.fillText('END ZONE', fx + fw / 2, fy + fh - endZoneH / 2)
  },

  _drawBrickMarks(ctx, w, h) {
    const endZoneH = h * 0.18
    const margin = w * 0.08

    // Top brick mark (X) - just below top scoring zone
    const topBrickY = endZoneH + (h * 0.06)
    this._drawBrickX(ctx, margin, topBrickY)
    this._drawBrickX(ctx, w - margin, topBrickY)

    // Bottom brick mark (X) - just above bottom scoring zone
    const bottomBrickY = h - endZoneH - (h * 0.06)
    this._drawBrickX(ctx, margin, bottomBrickY)
    this._drawBrickX(ctx, w - margin, bottomBrickY)
  },

  _drawBrickX(ctx, x, y) {
    const size = 14
    ctx.save()
    ctx.strokeStyle = '#9CA3AF'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x - size, y - size)
    ctx.lineTo(x + size, y + size)
    ctx.moveTo(x + size, y - size)
    ctx.lineTo(x - size, y + size)
    ctx.stroke()

    // Small circle at center
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.strokeStyle = '#6B7280'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  },

  _toScreen(pos, w, h) {
    const field = this._getFieldRect(w, h)
    return {
      x: field.x + pos.x * field.w,
      y: field.y + pos.y * field.h
    }
  },

  _toNorm(sx, sy, w, h) {
    const field = this._getFieldRect(w, h)
    return {
      x: (sx - field.x) / field.w,
      y: (sy - field.y) / field.h
    }
  },

  // 检查新位置是否与其他球员或飞盘重叠
  _isOverlapping(newX, newY, skipPlayerIdx, skipDisc) {
    const step = this.data.steps[this.data.currentIndex]
    if (!step) return false

    // 检查球员重叠
    for (let i = 0; i < step.playerPositions.length; i++) {
      if (i === skipPlayerIdx) continue
      const p = step.playerPositions[i]
      const dx = p.x - newX
      const dy = p.y - newY
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) return true
    }

    // 检查飞盘重叠
    if (!skipDisc && step.discPosition) {
      const dx = step.discPosition.x - newX
      const dy = step.discPosition.y - newY
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) return true
    }

    return false
  },

  // 检查飞盘新位置是否与球员重叠
  _isDiscOverlapping(newX, newY) {
    const step = this.data.steps[this.data.currentIndex]
    if (!step) return false
    for (let i = 0; i < step.playerPositions.length; i++) {
      const p = step.playerPositions[i]
      const dx = p.x - newX
      const dy = p.y - newY
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE) return true
    }
    return false
  },

  _drawPaths(ctx, w, h) {
    const prevStep = this.data.steps[this.data.currentIndex - 1]
    const currentStep = this.data.steps[this.data.currentIndex]
    if (!prevStep || !currentStep) return

    // Player paths: from previous step position to current step position
    currentStep.playerPositions.forEach(curPos => {
      const prevPos = prevStep.playerPositions.find(p => p.id === curPos.id)
      if (!prevPos) return
      if (curPos.x === prevPos.x && curPos.y === prevPos.y) return

      const p1 = this._toScreen(prevPos, w, h)
      const p2 = this._toScreen(curPos, w, h)
      const cpNorm = this._getBezierCP(prevPos, curPos)
      const cp = cpNorm ? this._toScreen(cpNorm, w, h) : null

      ctx.save()
      ctx.strokeStyle = curPos.color === 'blue' ? COLORS.PATH_BLUE : COLORS.PATH_RED
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      if (cp) {
        ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y)
      } else {
        ctx.lineTo(p2.x, p2.y)
      }
      ctx.stroke()
      ctx.restore()

      // Draw control point handle
      if (cp) {
        ctx.save()
        ctx.fillStyle = curPos.color === 'blue' ? COLORS.PATH_BLUE : COLORS.PATH_RED
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      }
    })

    // Disc path: from previous step to current step
    if (prevStep.discPosition && currentStep.discPosition) {
      const prevDisc = prevStep.discPosition
      const curDisc = currentStep.discPosition
      if (prevDisc.x !== curDisc.x || prevDisc.y !== curDisc.y) {
        const p1 = this._toScreen(prevDisc, w, h)
        const p2 = this._toScreen(curDisc, w, h)
        const cpNorm = this._getBezierCP(prevDisc, curDisc)
        const cp = cpNorm ? this._toScreen(cpNorm, w, h) : null

        ctx.save()
        ctx.strokeStyle = COLORS.PATH_DISC
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        if (cp) {
          ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y)
        } else {
          ctx.lineTo(p2.x, p2.y)
        }
        ctx.stroke()
        ctx.restore()

        // Draw disc control point handle
        if (cp) {
          ctx.save()
          ctx.fillStyle = COLORS.PATH_DISC
          ctx.globalAlpha = 0.6
          ctx.beginPath()
          ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.restore()
        }
      }
    }
  },

  _getPathControl(prevPos, curPos, w, h) {
    if (!curPos.pathControl) return null
    return this._toScreen(curPos.pathControl, w, h)
  },

  // 将用户拖拽的点(曲线经过的点)转为二次贝塞尔的实际控制点
  // CP = 2*M - (P0+P1)/2, 这样曲线会精确经过M点
  _getBezierCP(fromPos, toPos) {
    if (!toPos.pathControl) return null
    const m = toPos.pathControl
    return {
      x: 2 * m.x - (fromPos.x + toPos.x) / 2,
      y: 2 * m.y - (fromPos.y + toPos.y) / 2
    }
  },

  _drawTargetMarkers(ctx, w, h) {
    const nextStep = this.data.steps[this.data.currentIndex + 1]
    if (!nextStep) return

    nextStep.playerPositions.forEach(pos => {
      const p = this._toScreen(pos, w, h)
      ctx.save()
      ctx.strokeStyle = COLORS.TARGET
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.6

      // X marker
      const s = MARKER_SIZE
      ctx.beginPath()
      ctx.moveTo(p.x - s / 2, p.y - s / 2)
      ctx.lineTo(p.x + s / 2, p.y + s / 2)
      ctx.moveTo(p.x + s / 2, p.y - s / 2)
      ctx.lineTo(p.x - s / 2, p.y + s / 2)
      ctx.stroke()

      // Small circle
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    })
  },

  _drawPlayer(ctx, pos, w, h) {
    const p = this._toScreen(pos, w, h)
    const color = pos.color === 'blue' ? COLORS.BLUE : COLORS.RED

    // Shadow
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.2)'
    ctx.shadowBlur = 3
    ctx.shadowOffsetY = 1

    // Outer ring
    ctx.beginPath()
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()

    // Inner highlight ring
    ctx.save()
    ctx.beginPath()
    ctx.arc(p.x, p.y, PLAYER_RADIUS - 2, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()

    // Label
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const label = pos.id.replace(/^(O|R)/, '')
    ctx.fillText(label, p.x, p.y)
  },

  _drawDisc(ctx, pos, w, h) {
    if (!pos) return
    const p = this._toScreen(pos, w, h)

    ctx.save()

    // Outer ring
    ctx.beginPath()
    ctx.arc(p.x, p.y, DISC_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.DISC
    ctx.fill()

    // Inner ring
    ctx.beginPath()
    ctx.arc(p.x, p.y, DISC_RADIUS - 3, 0, Math.PI * 2)
    ctx.fillStyle = '#FEF3C7'
    ctx.fill()

    // Inner dot
    ctx.beginPath()
    ctx.arc(p.x, p.y, DISC_RADIUS - 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.DISC
    ctx.fill()

    // Outer border
    ctx.beginPath()
    ctx.arc(p.x, p.y, DISC_RADIUS, 0, Math.PI * 2)
    ctx.strokeStyle = '#B45309'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.restore()
  },

  // ===== 工具栏操作 =====
  onBack() {
    wx.navigateBack({
      fail: () => {
        // 通过分享链接进入时无上一页，跳回战术列表
        wx.redirectTo({ url: '/pages/tactics/list' })
      }
    })
  },

  onUndo() {
    if (this._historyIndex > 0) {
      this._historyIndex--
      const snapshot = this._history[this._historyIndex]
      this._restoreSnapshot(snapshot)
      this.setData({ saveStatusText: '已撤销' })
    } else {
      wx.showToast({ title: '没有更多撤销', icon: 'none' })
    }
  },

  onRedo() {
    if (this._historyIndex < this._history.length - 1) {
      this._historyIndex++
      const snapshot = this._history[this._historyIndex]
      this._restoreSnapshot(snapshot)
      this.setData({ saveStatusText: '已重做' })
    } else {
      wx.showToast({ title: '没有更多重做', icon: 'none' })
    }
  },

  _pushHistory() {
    this._history = this._history.slice(0, this._historyIndex + 1)
    this._history.push(deepClone({
      steps: this.data.steps,
      currentIndex: this.data.currentIndex
    }))
    if (this._history.length > 50) this._history.shift()
    this._historyIndex = this._history.length - 1
  },

  _restoreSnapshot(snapshot) {
    this.setData({
      steps: snapshot.steps,
      currentIndex: snapshot.currentIndex
    })
    this._updateOnFieldFromSteps()
    this._draw()
  },

  _updateOnFieldFromSteps() {
    const allOnField = new Set()
    this.data.steps.forEach(step => {
      step.playerPositions.forEach(p => allOnField.add(p.id))
    })
    this._onFieldIds = allOnField

    const bluePlayers = this.data.bluePlayers.map(p => ({
      ...p, onField: allOnField.has(p.id)
    }))
    const redPlayers = this.data.redPlayers.map(p => ({
      ...p, onField: allOnField.has(p.id)
    }))
    this.setData({ bluePlayers, redPlayers })
  },

  onZoom() {
    wx.showToast({ title: '双指缩放画布', icon: 'none' })
  },

  onSave() {
    this._saveTactic(success => {
      if (success) {
        wx.showToast({ title: '保存成功', icon: 'success' })
      }
    })
  },

  onHelp() {
    wx.showModal({
      title: '使用说明',
      content: '长按右侧道具栏中的队员，然后拖动到画布上即可放置。拖动场上队员移动位置，会自动显示运动路径。',
      showCancel: false
    })
  },

  onShare() {
    // 触发保存（异步进行，不影响 button open-type="share" 弹出聊天选择）
    if (this.data.tacticId) {
      this._saveTactic()
    } else {
      // 首次分享需要先创建一条云端记录
      this._saveTactic(success => {
        if (success) {
          wx.showToast({ title: '已保存', icon: 'success', duration: 800 })
        }
      })
    }
    // 截取场地作为分享图片
    if (this._canvas) {
      wx.canvasToTempFilePath({
        canvas: this._canvas,
        x: 0,
        y: 0,
        width: this.data.canvasWidth,
        height: this.data.canvasHeight,
        destWidth: this.data.canvasWidth * this._dpr,
        destHeight: this.data.canvasHeight * this._dpr,
        success: (res) => {
          this.setData({ shareImage: res.tempFilePath })
        },
        fail: () => {
          this.setData({ shareImage: '' })
        }
      })
    }
  },

  onShareAppMessage(e) {
    const imageUrl = this.data.shareImage || '/images/战术板.png'
    const tacticId = this.data.tacticId || ''
    return {
      title: '战术板：' + (this.data.tacticName || '新战术'),
      path: '/pages/tactics/view?id=' + tacticId,
      imageUrl: imageUrl
    }
  },

  onReset() {
    wx.showModal({
      title: '重置战术',
      content: '确定要重置所有内容吗？',
      success: (res) => {
        if (res.confirm) {
          this._initNewTactic()
        }
      }
    })
  },

  onNameInput(e) {
    this.setData({
      tacticName: e.detail.value,
      saveStatusText: '编辑中'
    })
  },

  // ===== 道具栏交互（直接拖拽） =====
  onInvItemTouchStart(e) {
    const item = e.currentTarget
    const id = item.dataset.id
    const color = item.dataset.color
    const label = item.dataset.label
    const type = item.dataset.type
    const touch = e.touches[0]

    // 飞盘拖拽
    if (type === 'disc') {
      this._draggingItem = {
        id: 'disc',
        color: 'disc',
        label: '飞盘',
        colorClass: 'disc',
        type: 'disc'
      }
      this.setData({
        draggingItem: {
          id: 'disc',
          color: 'disc',
          label: '飞盘',
          colorClass: 'disc',
          type: 'disc'
        },
        dragX: touch.clientX,
        dragY: touch.clientY
      })
      return
    }

    // 队员拖拽：动态计算该颜色下一名次编号
    const prefix = color === 'blue' ? 'O' : 'R'
    let nextNum = 1
    const curStep = this.data.steps[this.data.currentIndex]
    if (curStep && curStep.playerPositions) {
      curStep.playerPositions.forEach(p => {
        if (p.color === color) nextNum++
      })
    }
    const dynId = prefix + nextNum
    const dynLabel = '' + nextNum

    this._draggingItem = {
      id: dynId, color, label: dynLabel,
      colorClass: color === 'blue' ? 'blue' : 'red',
      type: 'player'
    }

    this.setData({
      draggingItem: {
        id: dynId, color, label: dynLabel,
        colorClass: color === 'blue' ? 'blue' : 'red',
        type: 'player'
      },
      dragX: touch.clientX,
      dragY: touch.clientY
    })
  },

  onAddProp(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'disc') {
      const step = this.data.steps[this.data.currentIndex]
      if (step.discPosition) {
        wx.showToast({ title: '已有飞盘', icon: 'none' })
        return
      }
      this._updateStep(this.data.currentIndex, {
        discPosition: { x: 0.5, y: 0.5 }
      })
      this.setData({ saveStatusText: '编辑中' })
      this._draw()
    } else {
      wx.showToast({ title: '请长按拖入', icon: 'none' })
    }
  },

  // ===== 页面级触摸（处理跨元素拖拽） =====
  onPageTouchMove(e) {
    if (this._draggingItem) {
      const touch = e.touches[0]
      this.setData({
        dragX: touch.clientX,
        dragY: touch.clientY
      })
    }
  },

  onPageTouchEnd(e) {
    if (this._draggingItem) {
      const touch = e.changedTouches[0]
      this._dropDraggedItem(touch.clientX, touch.clientY)
    }
  },

  _dropDraggedItem(clientX, clientY) {
    const item = this._draggingItem
    if (!item) return

    // 先检查是否拖到删除区域
    wx.createSelectorQuery()
      .select('#deleteZone')
      .boundingClientRect((delRect) => {
        if (delRect && clientX >= delRect.left && clientX <= delRect.right &&
            clientY >= delRect.top && clientY <= delRect.bottom) {
          // 拖到删除区域 - 对于从道具栏拖来的新道具，直接取消
          this._draggingItem = null
          this.setData({ draggingItem: null, dragX: 0, dragY: 0 })
          return
        }

        // 检查是否拖到画布
        wx.createSelectorQuery()
          .select('#tacticsCanvas')
          .boundingClientRect((rect) => {
            if (rect) {
              const canvasX = clientX - rect.left
              const canvasY = clientY - rect.top
              if (canvasX >= 0 && canvasX <= rect.width && canvasY >= 0 && canvasY <= rect.height) {
                const field = this._getFieldRect(rect.width, rect.height)
                const fieldX = canvasX - field.x
                const fieldY = canvasY - field.y

                if (fieldX < 0 || fieldX > field.w || fieldY < 0 || fieldY > field.h) {
                  // 取消
                } else {
                  const norm = {
                    x: fieldX / field.w,
                    y: fieldY / field.h
                  }
                  const clampedX = Math.max(0.02, Math.min(0.98, norm.x))
                  const clampedY = Math.max(0.02, Math.min(0.98, norm.y))

                  const steps = [...this.data.steps]
                  const currentStep = steps[this.data.currentIndex]

                  if (item.type === 'disc') {
                    // 检查飞盘是否与球员重叠
                    if (this._isDiscOverlapping(clampedX, clampedY)) {
                      wx.showToast({ title: '位置重叠', icon: 'none', duration: 500 })
                      this._draggingItem = null
                      this.setData({ draggingItem: null, dragX: 0, dragY: 0 })
                      return
                    }
                    steps[this.data.currentIndex] = {
                      ...currentStep,
                      discPosition: { x: clampedX, y: clampedY }
                    }
                  } else {
                    // 检查新球员是否与现有球员或飞盘重叠
                    if (this._isOverlapping(clampedX, clampedY, -1, false)) {
                      wx.showToast({ title: '位置重叠', icon: 'none', duration: 500 })
                      this._draggingItem = null
                      this.setData({ draggingItem: null, dragX: 0, dragY: 0 })
                      return
                    }
                    const pos = {
                      id: item.id,
                      x: clampedX,
                      y: clampedY,
                      color: item.color
                    }
                    const playerPositions = [...currentStep.playerPositions, pos]
                    steps[this.data.currentIndex] = {
                      ...currentStep,
                      playerPositions
                    }
                  }

                  this._pushHistory()
                  this.setData({ steps, saveStatusText: '编辑中' })
                  this._updateOnFieldFromSteps()
                  this._draw()
                }
              }
            }
            this._draggingItem = null
            this.setData({ draggingItem: null, dragX: 0, dragY: 0 })
          })
          .exec()
      })
      .exec()
  },

  // ===== 画布触摸交互 =====
  onCanvasTouchStart(e) {
    this._touchStartTime = Date.now()
    this._longPressTriggered = false

    if (this._draggingItem) {
      return
    }

    const touch = e.touches[0]
    const w = this.data.canvasWidth
    const h = this.data.canvasHeight
    const norm = this._toNorm(touch.x, touch.y, w, h)

    const step = this.data.steps[this.data.currentIndex]
    if (!step) return

    // 1. Check if touching a player path control point
    if (this.data.currentIndex > 0) {
      const prevStep = this.data.steps[this.data.currentIndex - 1]
      for (let i = 0; i < step.playerPositions.length; i++) {
        const curPos = step.playerPositions[i]
        if (!curPos.pathControl) continue
        const cpScreen = this._toScreen(curPos.pathControl, w, h)
        const dx = touch.x - cpScreen.x
        const dy = touch.y - cpScreen.y
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          this._dragPathControl = { playerIdx: i }
          return
        }
      }
      // Check disc path control point
      if (step.discPosition && step.discPosition.pathControl) {
        const cpScreen = this._toScreen(step.discPosition.pathControl, w, h)
        const dx = touch.x - cpScreen.x
        const dy = touch.y - cpScreen.y
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          this._dragDiscPathControl = true
          return
        }
      }
    }

    // 2. Check if touching a player path midpoint (to create control point)
    if (this.data.currentIndex > 0) {
      const prevStep = this.data.steps[this.data.currentIndex - 1]
      for (let i = 0; i < step.playerPositions.length; i++) {
        const curPos = step.playerPositions[i]
        const prevPos = prevStep.playerPositions.find(p => p.id === curPos.id)
        if (!prevPos) continue
        if (curPos.x === prevPos.x && curPos.y === prevPos.y) continue
        if (curPos.pathControl) continue

        const p1 = this._toScreen(prevPos, w, h)
        const p2 = this._toScreen(curPos, w, h)
        const midX = (p1.x + p2.x) / 2
        const midY = (p1.y + p2.y) / 2
        const lineLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
        if (lineLen > 0) {
          const t = ((touch.x - p1.x) * (p2.x - p1.x) + (touch.y - p1.y) * (p2.y - p1.y)) / (lineLen * lineLen)
          if (t > 0.2 && t < 0.8) {
            const projX = p1.x + t * (p2.x - p1.x)
            const projY = p1.y + t * (p2.y - p1.y)
            const dist = Math.sqrt((touch.x - projX) ** 2 + (touch.y - projY) ** 2)
            if (dist < 18) {
              const perpX = -(p2.y - p1.y) / lineLen * 40
              const perpY = (p2.x - p1.x) / lineLen * 40
              const cpNorm = this._toNorm(midX + perpX, midY + perpY, w, h)
              const steps = [...this.data.steps]
              const players = [...steps[this.data.currentIndex].playerPositions]
              players[i] = { ...players[i], pathControl: cpNorm }
              steps[this.data.currentIndex] = { ...steps[this.data.currentIndex], playerPositions: players }
              this._pushHistory()
              this.setData({ steps, saveStatusText: '编辑中' })
              this._dragPathControl = { playerIdx: i }
              this._draw()
              return
            }
          }
        }
      }
      // Check disc path midpoint (to create disc control point)
      if (step.discPosition && prevStep.discPosition) {
        const prevDisc = prevStep.discPosition
        const curDisc = step.discPosition
        if (curDisc.pathControl) {
          // already has control point, skip
        } else if (prevDisc.x !== curDisc.x || prevDisc.y !== curDisc.y) {
          const p1 = this._toScreen(prevDisc, w, h)
          const p2 = this._toScreen(curDisc, w, h)
          const midX = (p1.x + p2.x) / 2
          const midY = (p1.y + p2.y) / 2
          const lineLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
          if (lineLen > 0) {
            const t = ((touch.x - p1.x) * (p2.x - p1.x) + (touch.y - p1.y) * (p2.y - p1.y)) / (lineLen * lineLen)
            if (t > 0.2 && t < 0.8) {
              const projX = p1.x + t * (p2.x - p1.x)
              const projY = p1.y + t * (p2.y - p1.y)
              const dist = Math.sqrt((touch.x - projX) ** 2 + (touch.y - projY) ** 2)
              if (dist < 18) {
                const perpX = -(p2.y - p1.y) / lineLen * 40
                const perpY = (p2.x - p1.x) / lineLen * 40
                const cpNorm = this._toNorm(midX + perpX, midY + perpY, w, h)
                const steps = [...this.data.steps]
                const newDisc = { ...steps[this.data.currentIndex].discPosition, pathControl: cpNorm }
                steps[this.data.currentIndex] = { ...steps[this.data.currentIndex], discPosition: newDisc }
                this._pushHistory()
                this.setData({ steps, saveStatusText: '编辑中' })
                this._dragDiscPathControl = true
                this._draw()
                return
              }
            }
          }
        }
      }
    }

    // 3. Check if touching a player
    let touchedPlayerIdx = -1
    for (let i = 0; i < step.playerPositions.length; i++) {
      const p = step.playerPositions[i]
      const screen = this._toScreen(p, w, h)
      const dx = touch.x - screen.x
      const dy = touch.y - screen.y
      if (Math.sqrt(dx * dx + dy * dy) < PLAYER_RADIUS + 5) {
        touchedPlayerIdx = i
        break
      }
    }

    // 4. Check disc touch (优先于球员，飞盘在最顶层)
    let discTouched = false
    if (step.discPosition) {
      const screen = this._toScreen(step.discPosition, w, h)
      const dx = touch.x - screen.x
      const dy = touch.y - screen.y
      if (Math.sqrt(dx * dx + dy * dy) < DISC_RADIUS + 5) {
        discTouched = true
      }
    }

    if (discTouched) {
      // 飞盘优先，只拖飞盘不拖球员
      this._dragDisc = true
      this._dragStartPlayer = null
    } else if (touchedPlayerIdx >= 0) {
      this._dragStartPlayer = { idx: touchedPlayerIdx, startNorm: norm }
      this._dragDisc = false
    } else {
      this._dragStartPlayer = null
      this._dragDisc = false
    }
  },

  onCanvasTouchMove(e) {
    if (this._draggingItem) return

    const touch = e.touches[0]
    const w = this.data.canvasWidth
    const h = this.data.canvasHeight

    // Handle moving player path control point
    if (this._dragPathControl) {
      const norm = this._toNorm(touch.x, touch.y, w, h)
      const x = Math.max(0.02, Math.min(0.98, norm.x))
      const y = Math.max(0.02, Math.min(0.98, norm.y))

      const steps = [...this.data.steps]
      const players = [...steps[this.data.currentIndex].playerPositions]
      players[this._dragPathControl.playerIdx] = {
        ...players[this._dragPathControl.playerIdx],
        pathControl: { x, y }
      }
      steps[this.data.currentIndex] = {
        ...steps[this.data.currentIndex],
        playerPositions: players
      }
      this.setData({ steps, saveStatusText: '编辑中' })
      this._draw()
      return
    }

    // Handle moving disc path control point
    if (this._dragDiscPathControl) {
      const norm = this._toNorm(touch.x, touch.y, w, h)
      const x = Math.max(0.02, Math.min(0.98, norm.x))
      const y = Math.max(0.02, Math.min(0.98, norm.y))

      const steps = [...this.data.steps]
      const newDisc = { ...steps[this.data.currentIndex].discPosition, pathControl: { x, y } }
      steps[this.data.currentIndex] = { ...steps[this.data.currentIndex], discPosition: newDisc }
      this.setData({ steps, saveStatusText: '编辑中' })
      this._draw()
      return
    }

    // Handle moving existing player
    if (this._dragStartPlayer) {
      const norm = this._toNorm(touch.x, touch.y, w, h)
      const x = Math.max(0.02, Math.min(0.98, norm.x))
      const y = Math.max(0.02, Math.min(0.98, norm.y))

      // 检查重叠，不允许放置在其他球员或飞盘上
      if (this._isOverlapping(x, y, this._dragStartPlayer.idx, false)) return

      const step = this.data.steps[this.data.currentIndex]
      const playerPositions = [...step.playerPositions]
      playerPositions[this._dragStartPlayer.idx] = {
        ...playerPositions[this._dragStartPlayer.idx],
        x, y
      }

      const steps = [...this.data.steps]
      steps[this.data.currentIndex] = {
        ...steps[this.data.currentIndex],
        playerPositions
      }
      this.setData({ steps, saveStatusText: '编辑中' })
      this._draw()
    }

    // Handle moving disc
    if (this._dragDisc) {
      const norm = this._toNorm(touch.x, touch.y, w, h)
      const x = Math.max(0.02, Math.min(0.98, norm.x))
      const y = Math.max(0.02, Math.min(0.98, norm.y))

      // 检查飞盘是否与球员重叠
      if (this._isDiscOverlapping(x, y)) return

      const steps = [...this.data.steps]
      steps[this.data.currentIndex] = {
        ...steps[this.data.currentIndex],
        discPosition: { x, y }
      }
      this.setData({ steps, saveStatusText: '编辑中' })
      this._draw()
    }
  },

  onCanvasTouchEnd(e) {
    if (this._draggingItem) return

    // Clear path control drag
    if (this._dragPathControl) {
      this._pushHistory()
      this._dragPathControl = null
      return
    }
    if (this._dragDiscPathControl) {
      this._pushHistory()
      this._dragDiscPathControl = null
      return
    }

    const touch = e.changedTouches[0]
    const clientX = touch ? touch.clientX : 0
    const clientY = touch ? touch.clientY : 0

    // 检查是否拖到删除区域
    wx.createSelectorQuery()
      .select('#deleteZone')
      .boundingClientRect((delRect) => {
        const inDeleteZone = delRect && clientX >= delRect.left && clientX <= delRect.right &&
              clientY >= delRect.top && clientY <= delRect.bottom

        if (inDeleteZone) {
          // 删除队员
          if (this._dragStartPlayer) {
            const steps = [...this.data.steps]
            const currentStep = steps[this.data.currentIndex]
            currentStep.playerPositions.splice(this._dragStartPlayer.idx, 1)
            steps[this.data.currentIndex] = { ...currentStep }
            this._pushHistory()
            this.setData({ steps, saveStatusText: '编辑中' })
            this._updateOnFieldFromSteps()
            this._draw()
            this._dragStartPlayer = null
            return
          }
          // 删除飞盘
          if (this._dragDisc) {
            const steps = [...this.data.steps]
            steps[this.data.currentIndex] = {
              ...steps[this.data.currentIndex],
              discPosition: null
            }
            this._pushHistory()
            this.setData({ steps, saveStatusText: '编辑中' })
            this._draw()
            this._dragDisc = false
            return
          }
        }

        // 正常结束拖拽
        if (this._dragStartPlayer) {
          this._pushHistory()
          this._dragStartPlayer = null
        }
        if (this._dragDisc) {
          this._pushHistory()
          this._dragDisc = false
        }
      })
      .exec()
  },

  // ===== 步骤管理 =====
  _updateStep(index, updates) {
    const steps = [...this.data.steps]
    steps[index] = { ...steps[index], ...updates }
    this.setData({ steps })
  },

  onStepTap(e) {
    const index = e.currentTarget.dataset.index
    if (this._animating) return
    const step = this.data.steps[index]
    this.setData({
      currentIndex: index,
      currentStepDesc: step ? (step.description || '') : ''
    })
    this._draw()
  },

  onAddStep() {
    const currentStep = this.data.steps[this.data.currentIndex]
    const newStep = deepClone(currentStep)
    newStep.id = genId('step')
    newStep.playerPositions = newStep.playerPositions.map(p => {
      const copy = { ...p }
      delete copy.pathControl
      return copy
    })
    if (newStep.discPosition) {
      newStep.discPosition = { ...newStep.discPosition }
      delete newStep.discPosition.pathControl
    }
    // 新步骤不继承描述
    newStep.description = ''

    const steps = [...this.data.steps]
    steps.splice(this.data.currentIndex + 1, 0, newStep)

    // Re-number steps
    steps.forEach((s, i) => { s.number = i + 1 })

    this._pushHistory()
    this.setData({
      steps,
      currentIndex: this.data.currentIndex + 1,
      currentStepDesc: '',
      saveStatusText: '编辑中'
    })
    this._updateOnFieldFromSteps()
    this._draw()
  },

  onRemoveStep() {
    if (this.data.steps.length <= 1) {
      wx.showToast({ title: '至少保留一个步骤', icon: 'none' })
      return
    }
    const steps = [...this.data.steps]
    const removedIdx = this.data.currentIndex
    steps.splice(removedIdx, 1)
    steps.forEach((s, i) => { s.number = i + 1 })
    const newIdx = Math.min(removedIdx, steps.length - 1)

    this._pushHistory()
    this.setData({
      steps,
      currentIndex: newIdx,
      currentStepDesc: steps[newIdx] ? (steps[newIdx].description || '') : '',
      saveStatusText: '编辑中'
    })
    this._updateOnFieldFromSteps()
    this._draw()
  },

  // ===== 描述管理 =====
  onDescTouchMove() {
    // 阻止弹窗触摸穿透到下层
  },

  onStopPropagation() {
    // 阻止事件冒泡，防止点击弹窗内部时关闭弹窗
  },

  onShowDescModal() {
    const step = this.data.steps[this.data.currentIndex]
    const desc = step ? (step.description || '') : ''
    this.setData({
      showDescModal: true,
      descEditing: desc
    })
  },

  onHideDescModal() {
    this.setData({ showDescModal: false })
    // canvas 被 wx:if 销毁了，需要重新初始化
    setTimeout(() => this._initCanvas(), 50)
  },

  onDescInput(e) {
    // 仅更新编辑值，不触发步骤数据变更（避免键盘抖动）
    this._descEditingValue = e.detail.value
    this.setData({ descEditing: e.detail.value })
  },

  onDescBlur(e) {
    this._descEditingValue = e.detail.value
  },

  onCancelDesc() {
    this.setData({ showDescModal: false })
    setTimeout(() => this._initCanvas(), 50)
  },

  onSaveDesc() {
    const value = (this._descEditingValue !== undefined ? this._descEditingValue : this.data.descEditing) || ''
    const trimmed = value.trim()
    const steps = [...this.data.steps]
    if (steps[this.data.currentIndex]) {
      steps[this.data.currentIndex] = {
        ...steps[this.data.currentIndex],
        description: trimmed
      }
    }
    this._pushHistory()
    this.setData({
      steps,
      showDescModal: false,
      currentStepDesc: trimmed,
      saveStatusText: '编辑中'
    })
    // canvas 被销毁了，重新初始化并重绘
    setTimeout(() => this._initCanvas(), 50)
    // 自动保存到云端
    this._saveTactic()
  },

  // ===== 播放控制 =====
  onPlayToggle() {
    if (this.data.isPlaying) {
      this._stopPlaying()
      return
    }
    // 分段播放：从当前页播放到下一页
    const cur = this.data.currentIndex
    if (cur >= this.data.steps.length - 1) {
      wx.showToast({ title: '已是最后一页', icon: 'none' })
      return
    }
    this.setData({ isPlaying: true })
    this._animateToStep(cur, cur + 1, () => {
      const nextStep = this.data.steps[cur + 1]
      // 更新到目标步骤，保持弹窗显示，延迟后关闭
      this.setData({
        currentIndex: cur + 1,
        currentStepDesc: nextStep ? (nextStep.description || '') : ''
      })
      this._playingTimer = setTimeout(() => {
        this.setData({ isPlaying: false })
        this._draw()
      }, 1500)
    })
  },

  _stopPlaying() {
    this.setData({ isPlaying: false })
    this._animating = false
    if (this._playingTimer) {
      clearTimeout(this._playingTimer)
      this._playingTimer = null
    }
    this._draw()
  },

  _playNextStep() {
    if (!this.data.isPlaying) return
    const cur = this.data.currentIndex
    if (cur >= this.data.steps.length - 1) {
      this.setData({ isPlaying: false })
      this._draw()
      return
    }

    this._animateToStep(cur, cur + 1, () => {
      const nextStep = this.data.steps[cur + 1]
      this.setData({
        currentIndex: cur + 1,
        currentStepDesc: nextStep ? (nextStep.description || '') : ''
      })
      if (this.data.isPlaying) {
        this._playingTimer = setTimeout(() => {
          this._playNextStep()
        }, 1200)
      }
    })
  },

  _drawAnimPaths(ctx, w, h, fromStep, toStep, t) {
    // Player paths
    fromStep.playerPositions.forEach(fromPos => {
      const toPos = toStep.playerPositions.find(p => p.id === fromPos.id)
      if (!toPos) return
      if (fromPos.x === toPos.x && fromPos.y === toPos.y) return

      const p1 = this._toScreen(fromPos, w, h)
      const p2 = this._toScreen(toPos, w, h)
      const cpNorm = this._getBezierCP(fromPos, toPos)
      const cp = cpNorm ? this._toScreen(cpNorm, w, h) : null

      ctx.save()
      ctx.strokeStyle = toPos.color === 'blue' ? COLORS.PATH_BLUE : COLORS.PATH_RED
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      if (cp) {
        ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y)
      } else {
        ctx.lineTo(p2.x, p2.y)
      }
      ctx.stroke()
      ctx.restore()
    })

    // Disc path
    if (fromStep.discPosition && toStep.discPosition) {
      const p1 = this._toScreen(fromStep.discPosition, w, h)
      const p2 = this._toScreen(toStep.discPosition, w, h)
      if (fromStep.discPosition.x !== toStep.discPosition.x || fromStep.discPosition.y !== toStep.discPosition.y) {
        const cpNorm = this._getBezierCP(fromStep.discPosition, toStep.discPosition)
        const cp = cpNorm ? this._toScreen(cpNorm, w, h) : null
        ctx.save()
        ctx.strokeStyle = COLORS.PATH_DISC
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.globalAlpha = 0.5
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        if (cp) {
          ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y)
        } else {
          ctx.lineTo(p2.x, p2.y)
        }
        ctx.stroke()
        ctx.restore()
      }
    }
  },

  _animateToStep(fromIdx, toIdx, onComplete) {
    this._animating = true
    this._animProgress = 0
    this._animFromIdx = fromIdx
    this._animToIdx = toIdx

    const duration = 1500
    const startTime = Date.now()
    const fromStep = this.data.steps[fromIdx]
    const toStep = this.data.steps[toIdx]

    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)
      this._animProgress = t

      const w = this.data.canvasWidth
      const h = this.data.canvasHeight
      const ctx = this._ctx
      if (!ctx) return

      ctx.clearRect(0, 0, w, h)
      this._drawGrid(ctx, w, h)
      this._drawField(ctx, w, h)

      // Draw paths during animation
      this._drawAnimPaths(ctx, w, h, fromStep, toStep, t)

      // Interpolate and draw players (along bezier if pathControl exists)
      fromStep.playerPositions.forEach(curPos => {
        const nextPos = toStep.playerPositions.find(p => p.id === curPos.id)
        if (!nextPos) return
        let ix, iy
        const cpNorm = this._getBezierCP(curPos, nextPos)
        if (cpNorm) {
          const mt = 1 - t
          ix = mt * mt * curPos.x + 2 * mt * t * cpNorm.x + t * t * nextPos.x
          iy = mt * mt * curPos.y + 2 * mt * t * cpNorm.y + t * t * nextPos.y
        } else {
          ix = curPos.x + (nextPos.x - curPos.x) * t
          iy = curPos.y + (nextPos.y - curPos.y) * t
        }
        this._drawPlayer(ctx, { ...curPos, x: ix, y: iy }, w, h)
      })

      // Interpolate and draw disc (along bezier if pathControl exists)
      if (fromStep.discPosition && toStep.discPosition) {
        let dx, dy
        const cpNorm = this._getBezierCP(fromStep.discPosition, toStep.discPosition)
        if (cpNorm) {
          const mt = 1 - t
          dx = mt * mt * fromStep.discPosition.x + 2 * mt * t * cpNorm.x + t * t * toStep.discPosition.x
          dy = mt * mt * fromStep.discPosition.y + 2 * mt * t * cpNorm.y + t * t * toStep.discPosition.y
        } else {
          dx = fromStep.discPosition.x + (toStep.discPosition.x - fromStep.discPosition.x) * t
          dy = fromStep.discPosition.y + (toStep.discPosition.y - fromStep.discPosition.y) * t
        }
        this._drawDisc(ctx, { x: dx, y: dy }, w, h)
      }

      if (t < 1) {
        this._canvas.requestAnimationFrame(animate)
      } else {
        this._animating = false
        onComplete && onComplete()
      }
    }

    this._canvas.requestAnimationFrame(animate)
  },

  onPlayAll() {
    if (this.data.steps.length <= 1) {
      wx.showToast({ title: '只有一页', icon: 'none' })
      return
    }
    this._stopPlaying()
    const firstStep = this.data.steps[0]
    this.setData({
      currentIndex: 0,
      isPlaying: true,
      currentStepDesc: firstStep ? (firstStep.description || '') : ''
    }, () => {
      this._draw()
      setTimeout(() => this._playNextStep(), 200)
    })
  },

  onPrevStep() {
    if (this._animating || this.data.isPlaying) return
    const idx = Math.max(0, this.data.currentIndex - 1)
    const step = this.data.steps[idx]
    this.setData({
      currentIndex: idx,
      currentStepDesc: step ? (step.description || '') : ''
    })
    this._draw()
  },

  onNextStep() {
    if (this._animating || this.data.isPlaying) return
    const idx = Math.min(this.data.steps.length - 1, this.data.currentIndex + 1)
    const step = this.data.steps[idx]
    this.setData({
      currentIndex: idx,
      currentStepDesc: step ? (step.description || '') : ''
    })
    this._draw()
  },

  // ===== 保存 =====
  _saveTactic(onDone) {
    const steps = this.data.steps
    const players = []
    const allOnField = new Set()
    steps.forEach(step => {
      step.playerPositions.forEach(p => {
        allOnField.add(p.id)
        if (!players.find(pl => pl.id === p.id)) {
          players.push({ id: p.id, color: p.color })
        }
      })
    })

    const tacticData = {
      name: this.data.tacticName,
      steps: deepClone(steps),
      currentIndex: this.data.currentIndex,
      playerCount: allOnField.size,
      stepCount: steps.length,
      players: players,
      hasDisc: !!(steps[0] && steps[0].discPosition)
    }

    this.setData({ saveStatusText: '保存中...' })
    wx.cloud.callFunction({
      name: 'saveTactic',
      data: {
        id: this.data.tacticId || '',
        tacticData
      }
    }).then(res => {
      const result = res.result || {}
      if (result.success) {
        const newId = result.data && result.data.id
        if (newId && newId !== this.data.tacticId) {
          this.setData({ tacticId: newId })
        }
        this.setData({ saveStatusText: '已保存' })
        onDone && onDone(true)
      } else {
        this.setData({ saveStatusText: '保存失败' })
        wx.showToast({ title: result.message || '保存失败', icon: 'none' })
        onDone && onDone(false)
      }
    }).catch(err => {
      console.error('Save tactic error:', err)
      this.setData({ saveStatusText: '保存失败' })
      wx.showToast({ title: '保存失败', icon: 'none' })
      onDone && onDone(false)
    })
  }
})