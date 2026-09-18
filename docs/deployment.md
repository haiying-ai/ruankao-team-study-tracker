# CloudBase 部署与维护指南

本指南分为首次上线和日常发布。首次上线会创建或修改云端基础设施；日常发布只更新代码和静态资源。真实口令、PIN 与 Token 全程通过安全提示输入，不写入命令、仓库或日志。

## 1. 准备工作

- Node.js 20+、npm 10+
- 腾讯云账号及一个 CloudBase 环境
- 已在本机完成 CloudBase CLI 登录授权
- 如需微信晨报：PushPlus Token 和普通群组 Topic

安装依赖并检查项目：

```powershell
npm install
npm run typecheck
npm test
npm run build
```

## 2. 创建 CloudBase 环境

在 CloudBase 控制台创建体验或按量环境。数据库选择 **文档型数据库（云数据库）**，因为代码使用 CloudBase 文档数据库 SDK 和 JSON 文档模型，不使用 PostgreSQL SQL 接口。

记录环境 ID、静态托管默认域名、API 云函数名（默认 `api`）和晨报云函数名（默认 `daily-notification`），把这些非秘密值写入 `deploy/cloudbase-deploy.config.json`。不要把团队口令、PIN、初始化 Token 或 PushPlus Token 写入该文件。

## 3. 部署两个云函数

先做本地演练，确认函数可以打包且 ZIP 未超过限制：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/deploy-cloudbase.ps1 -Target All -PlanOnly
```

再分别发布：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/deploy-cloudbase.ps1 -Target Api

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/deploy-cloudbase.ps1 -Target Notification
```

API 使用 Event 云函数并由 `serverless-http` 适配 Express。脚本将依赖预先打包进小型 ZIP，无需等待云端安装依赖；发布后会读取远端状态和修改时间确认生效。

## 4. 配置 HTTP 路由与访问策略

为 `api` 函数创建 `/api` HTTP 访问路径，并将前端的 `VITE_API_BASE` 指向该地址。

只允许匿名访问 `/api` 路由本身，业务身份由函数内的团队口令、会话和角色继续校验。文档数据库与晨报函数不开放匿名公网调用。启用 Rego `/api` 限定策略后，旧网关授权会立即失效，因此应在修改前记录当前策略，并在修改后立刻测试：

1. 错误团队口令不能获得成员列表。
2. 正确口令能进入成员选择。
3. 无会话请求不能读取学习快照。
4. 普通成员不能调用管理员接口。

## 5. 初始化团队与计划

API 函数部署时设置一次性 `SETUP_TOKEN` 环境变量。然后在本机运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/initialize-cloudbase.ps1 `
  -ApiUrl "https://你的API地址/api" `
  -AdminName "管理员显示名"
```

脚本会依次安全询问：一次性初始化 Token、团队口令和管理员 6 位 PIN。输入内容不回显，也不会出现在 PowerShell 历史中。初始化成功后，应删除或轮换云函数上的 `SETUP_TOKEN`，避免初始化入口长期可用。

管理员登录后可在“管理”页新增其他成员、随机生成 6 位 PIN，并为每名成员单独生成邀请文案。

## 6. 部署前端

确认 `.env.production` 只包含公开 API 地址，不包含任何秘密。然后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/deploy-cloudbase.ps1 -Target Frontend
```

脚本会完成类型检查、测试、构建、静态托管上传与线上入口资源哈希验证。首次上线后在微信内置浏览器走一遍完整流程：

1. 验证团队口令。
2. 选择成员并输入 PIN。
3. 完成/撤销任务并打卡。
4. 录入套卷成绩和错题标签。
5. 查看个人进度与团队页。
6. 用普通成员确认“管理”和邀请按钮不可见且接口不可调用。

## 7. 配置 PushPlus 晨报

管理员先在 PushPlus 创建普通群组并取得 Topic。成员通过群组二维码订阅。然后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/configure-pushplus.ps1 `
  -EnvId "你的环境ID" `
  -SiteUrl "https://你的静态站点域名" `
  -Topic "你的普通群组Topic"
```

Token 会通过安全提示读取，临时配置文件在 `finally` 中删除。脚本配置 07:00 主晨报、07:10 失败重试和所需的云端环境变量。

配置后用管理员页面的“测试通知”验证。PushPlus 若因平台实名认证、收费或微信策略无法满足需求，可停用晨报函数，不影响网站核心学习功能；替代渠道应保持“密钥仅在云端、失败有日志、消息不含隐私”的相同边界。

## 8. 日常增量发布

根据改动选择最小目标：

| 改动 | 命令目标 |
| --- | --- |
| Vue 页面、样式、PWA | `Frontend` |
| 登录、任务、成员、管理接口 | `Api` |
| 晨报内容、重试逻辑 | `Notification` |
| 跨层改动 | `All` |

每次先加 `-PlanOnly` 演练，再正式发布。脚本使用非交互命令、硬超时、远端状态验证和本地回退 ZIP，任何一步未确认成功都会以非零状态结束，不把“本地构建完成”误报为“云端已更新”。

## 9. 系统盘与临时文件控制

CloudBase CLI 在默认模式下可能把函数依赖或临时包写入系统临时目录。当前部署脚本采取以下约束：

- 工作区、stage、日志与回退 ZIP 固定在项目盘下的 `.cloudbase-deploy/` 和 `deploy/artifacts/`。
- 使用 `esbuild` 预打包依赖，避免云端/CLI 临时执行大规模 `npm install`。
- 每个外部命令都有 30–300 秒硬超时。
- 只清理系统临时目录中经过精确校验的 `.cloudbase_temp_<函数名>`，不扫描或删除整个临时目录。
- 日志不会长期保留包含环境变量或源码的函数详情响应。

若发布后磁盘异常，先比较项目盘 `.cloudbase-deploy`、系统 `%TEMP%` 中的 CloudBase 精确目录和 npm 缓存大小；确认绝对路径后再做定点清理，禁止递归删除宽泛目录。

## 10. 验收与故障定位

上线前至少确认：

- M/Z 段数与原始时长、1.5 倍速折算正确。
- 1003 道章节题、5 套近期真题、2 套模拟全部进入必做任务。
- 直播 1–5 为回放，直播 6–10 为固定节点。
- 滚动任务顺延而固定直播不移动；周日追赶和偏差计算正确。
- 30 天会话、权限隔离、多人同步、成绩录入正常。
- 07:00 晨报成功；失败时 07:10 只重试一次。
- 微信内置浏览器可以完成全流程，短时断网后写操作能恢复同步。

排障时依次检查：本地质量命令 → 部署日志 → 云函数状态/修改时间 → HTTP 路由 → 函数日志 → 数据库记录。不要仅根据控制台列表的旧时间或本地命令输出判断发布是否成功，最终以远端状态和实际请求结果为准。

### 默认域名与 PWA 下载提示

CloudBase 默认测试域名可能为非页面导航请求附加 `Content-Disposition: attachment`，而正常浏览器导航先显示访问确认页。参见[官方默认域名说明](https://docs.cloudbase.net/service/alias)。不能只检查 `200` 或 `text/html` 就认定页面可以正常打开，也不能把平台 HTML 中隐藏的“访问量已达上限”文案当作实际限流证据。

本项目不预缓存 HTML，不将普通 fetch 的首页响应直接作为导航兜底。根页面的真实导航使用 NetworkFirst：仅将 200、HTML、无附件头且包含本应用标记的响应存入独立缓存；离线读取时再次校验。线上风险提示、403、429 等真实响应保持原样，不通过旧缓存绕过平台策略。

发布须核对首页资源 hash 和 `sw.js` SHA-256，并用真实浏览器完成首次打开、平台访问确认、取得 Service Worker 控制后的再次刷新。缓存升级验收应保留旧缓存测试，确认旧 HTML 预缓存已被新版 worker 清理。不要要求用户清空 localStorage，否则可能丢失未同步学习记录；必要时在 PC 使用强制刷新触发更新。微信真机行为仍需单独验收，桌面无痕测试不等于微信可用。
