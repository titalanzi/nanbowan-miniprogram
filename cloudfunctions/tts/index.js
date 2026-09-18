const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: 'cloudbase-d1gy9zpsb97f7c289' })

const db = cloud.database()

let secret = {}
try {
  secret = require('./secret.json')
} catch (_) {}

exports.main = async (event, context) => {
  const { text } = event
  if (!text || typeof text !== 'string') {
    return { success: false, message: '缺少 text 参数' }
  }

  const secretId = process.env.TENCENT_SECRET_ID || secret.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY || secret.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    return { success: false, message: '未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY' }
  }

  // 用词汇 hash 作为缓存键，同一词映射到同一文件
  const hash = crypto.createHash('md5').update(text.toLowerCase()).digest('hex')
  const cacheKey = `tts_${hash}`

  try {
    // 1. 先查缓存表，看该词汇是否已有音频
    const cacheRes = await db.collection('tts_cache').doc(cacheKey).get()
    if (cacheRes && cacheRes.data && cacheRes.data.fileID) {
      // 缓存命中，直接返回永久有效的 fileID
      return {
        success: true,
        audioUrl: cacheRes.data.fileID,
        fromCache: true
      }
    }
  } catch (e) {
    // 缓存不存在，继续生成
  }

  try {
    // 2. 调用腾讯云 TTS 生成音频
    const audioBase64 = await callTencentTTS(text, secretId, secretKey)
    if (!audioBase64) {
      return { success: false, message: '语音合成未返回音频' }
    }

    const buffer = Buffer.from(audioBase64, 'base64')
    // 用 hash 作为文件名，同一词汇始终存到同一位置
    const cloudPath = `tts/${hash}.mp3`

    // 3. 上传到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: buffer
    })

    const fileID = uploadRes.fileID

    // 4. 存入缓存表
    try {
      await db.collection('tts_cache').doc(cacheKey).set({
        data: {
          word: text,
          fileID: fileID,
          hash: hash,
          createdAt: db.serverDate()
        }
      })
    } catch (cacheErr) {
      console.error('Save tts cache failed:', cacheErr)
    }

    return {
      success: true,
      audioUrl: fileID,
      fromCache: false
    }
  } catch (err) {
    console.error('TTS error:', err)
    return { success: false, message: err.message || '语音合成失败' }
  }
}

function callTencentTTS(text, secretId, secretKey) {
  return new Promise((resolve, reject) => {
    const https = require('https')

    const payload = JSON.stringify({
      Text: text,
      SessionId: `session-${Date.now()}`,
      Volume: 0,
      Speed: 0,
      ModelType: 1,
      VoiceType: 1050,
      PrimaryLanguage: 2,
      SampleRate: 16000,
      Codec: 'mp3'
    })

    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
    const service = 'tts'
    const host = 'tts.tencentcloudapi.com'
    const action = 'TextToVoice'
    const version = '2019-08-23'
    const algorithm = 'TC3-HMAC-SHA256'

    const httpRequestMethod = 'POST'
    const canonicalUri = '/'
    const canonicalQueryString = ''
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
    const signedHeaders = 'content-type;host'
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

    const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest()
    const kService = crypto.createHmac('sha256', kDate).update(service).digest()
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const options = {
      hostname: host,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'Authorization': authorization,
        'X-TC-Action': action,
        'X-TC-Timestamp': timestamp,
        'X-TC-Version': version
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          if (result.Response.Error) {
            reject(new Error(result.Response.Error.Message))
          } else if (result.Response.Audio) {
            resolve(result.Response.Audio)
          } else {
            reject(new Error('未返回音频数据'))
          }
        } catch (e) {
          reject(new Error('解析响应失败: ' + data))
        }
      })
    })

    req.on('error', (e) => reject(e))
    req.write(payload)
    req.end()
  })
}
