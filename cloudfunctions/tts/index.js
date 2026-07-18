const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloudbase-d1gy9zpsb97f7c289' })

// 从本地配置文件读取密钥
let secret = {}
try {
  secret = require('./secret.json')
} catch (_) {
  // secret.json 不存在时回退到环境变量
}

// 调用腾讯云 TTS API（直接用 https 请求，避免 SDK 体积过大在云函数中安装失败）
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

  try {
    const audioBase64 = await callTencentTTS(text, secretId, secretKey)
    if (!audioBase64) {
      return { success: false, message: '语音合成未返回音频' }
    }

    const buffer = Buffer.from(audioBase64, 'base64')
    const fileName = `tts/${Date.now()}.mp3`

    const uploadRes = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: buffer
    })

    const urlRes = await cloud.getTempFileURL({
      fileList: [uploadRes.fileID]
    })

    const tempFileURL = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL
    if (!tempFileURL) {
      return { success: false, message: '获取音频链接失败' }
    }

    return { success: true, audioUrl: tempFileURL }
  } catch (err) {
    console.error('TTS error:', err)
    return { success: false, message: err.message || '语音合成失败' }
  }
}

/**
 * 直接通过 HTTPS + 签名调用腾讯云 TTS API
 * 无需安装 tencentcloud-sdk-nodejs，云函数内更轻量稳定
 */
const crypto = require('crypto')

function callTencentTTS(text, secretId, secretKey) {
  return new Promise((resolve, reject) => {
    const https = require('https')

    const payload = JSON.stringify({
      Text: text,
      SessionId: `session-${Date.now()}`,
      Volume: 0,
      Speed: 0,
      ModelType: 1,
      VoiceType: 1050,       // 1050 = 英文女声，自然好听
      PrimaryLanguage: 2,    // 2 = 英文
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

    // 步骤1：拼接规范请求串
    const httpRequestMethod = 'POST'
    const canonicalUri = '/'
    const canonicalQueryString = ''
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
    const signedHeaders = 'content-type;host'
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex')
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

    // 步骤2：拼接待签名字符串
    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

    // 步骤3：计算签名
    const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest()
    const kService = crypto.createHmac('sha256', kDate).update(service).digest()
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    // 步骤4：拼接 Authorization
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
