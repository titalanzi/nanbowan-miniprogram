/**
 * Excel 取伙名单解析模块
 */
const XLSX = require('./xlsx.js')

// 获取字母后缀（用于重名处理）
function getLetterSuffix(index) {
  let suffix = ''
  let num = index
  while (num > 0) {
    num--
    suffix = String.fromCharCode(65 + (num % 26)) + suffix
    num = Math.floor(num / 26)
  }
  return suffix
}

// 解析 Excel 数据
function parseExcelData(worksheet) {
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

  if (!rawData || rawData.length === 0) {
    return { players: [], error: 'Excel数据为空' }
  }

  let headerRowIndex = -1
  let nameColIndex = -1
  let ticketColIndex = -1

  const nameColumnKeys = ['用户昵称', '昵称', '姓名', '名字', '用户名', '用户']
  const ticketColumnKeys = ['票种名称', '票种', '性别', '票类型']

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row || row.length === 0) continue

    for (let j = 0; j < row.length; j++) {
      const cell = (row[j] || '').toString().trim()
      if (nameColIndex < 0 && nameColumnKeys.some(k => cell.indexOf(k) !== -1)) {
        headerRowIndex = i
        nameColIndex = j
      }
      if (ticketColIndex < 0 && ticketColumnKeys.some(k => cell.indexOf(k) !== -1)) {
        ticketColIndex = j
      }
    }

    if (nameColIndex >= 0) break
  }

  if (headerRowIndex < 0 || nameColIndex < 0) {
    return { players: [], error: '未找到用户昵称列' }
  }

  const nameCountMap = {}
  const players = []

  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i]
    if (!row || row.length === 0) continue

    const name = (row[nameColIndex] || '').toString().trim()
    if (!name) continue

    const ticketName = ticketColIndex >= 0 ? (row[ticketColIndex] || '').toString().trim() : ''
    let gender = 'male'
    if (ticketName.indexOf('女') !== -1) {
      gender = 'female'
    }

    const count = nameCountMap[name] || 0
    nameCountMap[name] = count + 1

    let finalName = name
    if (count > 0) {
      finalName = name + getLetterSuffix(count)
    }

    players.push({
      id: 'import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: finalName,
      gender: gender,
      originalName: name
    })
  }

  return { players, error: null }
}

// 选择并导入 Excel 文件
function chooseAndParseExcel() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: function (res) {
        const file = res.tempFiles[0]
        const fileName = file.name.toLowerCase()

        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
          resolve({ players: [], error: '请选择Excel文件' })
          return
        }

        wx.showLoading({ title: '解析中...' })

        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'binary',
          success: function (data) {
            try {
              const workbook = XLSX.read(data.data, { type: 'binary' })
              const firstSheetName = workbook.SheetNames[0]
              const worksheet = workbook.Sheets[firstSheetName]
              const result = parseExcelData(worksheet)
              wx.hideLoading()
              resolve(result)
            } catch (e) {
              wx.hideLoading()
              resolve({ players: [], error: '文件解析失败' })
            }
          },
          fail: function () {
            wx.hideLoading()
            resolve({ players: [], error: '读取文件失败' })
          }
        })
      },
      fail: function () {
        resolve({ players: [], error: '未选择文件' })
      }
    })
  })
}

module.exports = {
  parseExcelData,
  getLetterSuffix,
  chooseAndParseExcel
}
