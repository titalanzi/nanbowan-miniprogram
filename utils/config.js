// 应用配置（敏感配置请勿提交 git）
// 助理码优先通过云数据库 assistant_codes 集合验证，此处仅做本地开发备用
// 云数据库结构：collection 'assistant_codes'，字段 { code: string, active: boolean }
module.exports = {
  DEFAULT_ASSISTANT_CODES: ['kangtianyu'] // 本地备用码，正式环境建议删除此数组
}
