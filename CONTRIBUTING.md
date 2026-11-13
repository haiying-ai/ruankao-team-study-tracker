# 参与贡献

软考学习追踪器：Vue 3 + TypeScript + CloudBase。核心逻辑（日期、计划生成、进度、记忆队列）都有单测覆盖，改动请保证测试仍然全绿。

## 环境

- Node.js 22
- 复制 `.env.production.example` 为 `.env.production` 并填入自己的 CloudBase 配置（**不要提交**）

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

CI 固定 `TZ=Asia/Shanghai`：计划逻辑里的"每周日"是按北京时间判断的，本地如果时区不同，用例可能偏一天。

## 约定

- **日期一律走 `src/utils/date.ts`**，不要在组件里直接 `new Date()` 做运算
- **`VITE_` 前缀的变量会被打包进前端产物**，密钥不要用这个前缀
- 新增功能请补对应单测；纯样式调整可以不加
- 依赖变更请同时提交 `package-lock.json`

## 提 PR

- 说明改动目标、验证命令与结果
- 涉及 CloudBase 数据结构请说明是否需要迁移
- 安全问题请走 **Security** 页私密报告
