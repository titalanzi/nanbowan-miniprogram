# 南波万飞盘

一个用于飞盘比赛管理与统计的微信小程序，支持比赛创建、分组管理、实时记录、MVP排行榜、飞盘精神榜等功能。

## 技术栈

- **微信小程序原生开发** - WXML + WXSS + JavaScript
- **Vant Weapp** - UI 组件库（van-popup、van-icon、van-tag、van-button 等）
- **微信云开发** - 云函数 + 云数据库同步
- **自封装 Storage** - 本地缓存 + 云端双写

## 功能列表

### 比赛管理
- 创建比赛（名称、地点、日期）
- 分组设置：手动模式 / 随机分配模式
- 随机分配：录入队员 → 创建队伍（队长+固定队员） → 随机分配 → 手动调整
- 编辑分组：成员移动、添加/删除队伍、添加/删除成员

### 比赛记录
- 实时记录得分、助攻、D盘、烂盘等统计项
- 自定义统计类型
- 比赛进行中 / 已结束状态切换

### 排行榜
- MVP排行榜（得分 + 3×助攻 + 2×D盘 - 2×烂盘）
- 各统计项排行榜（得分王、助攻王、D盘王等）
- 飞盘精神榜（点赞/反对，精神分 = 点赞数 - 反对数）

### 其他
- 比赛历史记录
- 个人中心（注册、角色管理）

## 安装与运行

### 1. 克隆项目
```bash
git clone https://github.com/titalanzi/nanbowan-miniprogram.git
```

### 2. 安装依赖
在微信开发者工具中：
- 点击 **工具 → 构建 npm**
- 确保已安装 Vant Weapp（项目已包含 `package.json`）

### 3. 配置云开发
- 在微信开发者工具中开通云开发环境
- 上传并部署 `cloudfunctions/` 目录下的云函数：
  - `syncMatch` - 同步比赛数据
  - `getMatchesFromCloud` - 获取云端比赛列表
  - `syncUser` - 同步用户数据
  - 其他云函数...

### 4. 运行项目
- 用微信开发者工具打开项目根目录
- 编译预览即可运行

## 目录结构

```
nanbowan-miniprogram/
├── pages/                  # 页面目录
│   ├── index/              # 首页
│   ├── create-match/       # 创建比赛
│   ├── match-detail/       # 比赛详情
│   ├── match-record/       # 比赛记录
│   ├── edit-groups/        # 编辑分组
│   ├── rankings/           # 排行榜
│   ├── mine/               # 个人中心
│   └── ...
├── cloudfunctions/         # 云函数
│   ├── syncMatch/
│   ├── getMatchesFromCloud/
│   └── ...
├── images/                 # 图片资源
│   ├── 男.png              # 性别图标
│   ├── 女.png
│   ├── 冠军.png            # 排名图标
│   ├── 点赞.png            # 飞盘精神榜图标
│   └── ...
├── utils/                  # 工具函数
│   ├── storage.js          # 本地存储 + 云端同步封装
│   └── cloud.js            # 云开发辅助函数
├── app.js                  # 小程序入口
├── app.json                # 小程序配置
├── app.wxss                # 全局样式
└── package.json            # npm 依赖配置
```

## 注意事项

- 云函数需要在微信开发者工具中手动部署到云端
- `miniprogram_npm/` 目录已排除，需要在开发者工具中重新构建 npm
- 用户角色权限：普通用户只能修改自己的比赛，助理用户可以修改所有比赛

## 贡献指南

欢迎提交 Issue 和 Pull Request：

1. Fork 本仓库
2. 创建新分支：`git checkout -b feature/新功能`
3. 提交更改：`git commit -m '添加新功能'`
4. 推送分支：`git push origin feature/新功能`
5. 提交 Pull Request

## License

MIT License
