# 部署与交付规格

> 版本：v1.0 MVP Frozen

## 1. 目标

同时满足：

1. 评审者打开公网 URL 可完整体验 Funnel 和模拟支付。
2. 评审者克隆仓库后可按 README 在本地稳定启动与测试。

## 2. 推荐拓扑

```text
线上
GitHub → Vercel（Next.js UI + Route Handlers）
                ↓ Prisma（运行时连接池）
             Supabase PostgreSQL

本地
Git Clone → Next.js + Prisma
                   ↓
             Docker PostgreSQL
```

技术组合：Next.js App Router（Node.js runtime）、TypeScript strict、Zod、Prisma、PostgreSQL、Vitest、Playwright、GitHub Actions。依赖版本必须通过 `package-lock.json` 固定，避免部署时自动升级产生环境漂移。

## 3. 线上要求

- HTTPS 公网 URL，无需评审者登录基础设施账号。
- 生产环境变量由平台管理，不提交仓库。
- 应用运行时使用 Supavisor transaction mode 连接池 URL，并按 Supabase 对 Prisma 的要求配置 prepared statement 兼容参数；迁移使用直连 URL。
- 部署后执行迁移与受控 Seed，不能依赖开发机数据库。
- `/api/health` 返回应用和必要依赖的可用状态，但不泄露配置。
- 线上可创建新匿名 Session，并提供固定的已付费演示 Session。
- Vercel/Supabase 免费层限制和冷启动行为写入 README 已知限制。
- Prisma Client 在模块全局复用，开发环境避免热更新重复创建实例；Decimal/Date 在 DTO 层显式转换，不把 ORM 类型直接序列化为 API 契约。
- 数据库事务内只执行校验、计算和数据库读写，不进行外部网络调用或人为等待。

## 4. 本地复现要求

前置条件：Node.js 指定版本、npm、Docker/Compose。目标流程：

```text
git clone
→ 复制 .env.example 为 .env
→ npm install（或 npm ci）
→ docker compose up -d
→ prisma migrate deploy/dev
→ prisma db seed
→ npm run dev
→ npm test
```

README 必须给出准确命令、默认端口、环境变量说明和常见故障处理。不得要求评审者注册 Supabase 才能本地运行。

## 5. 环境变量清单

| 变量 | 作用 | 提交仓库 |
|---|---|:---:|
| `DATABASE_URL` | 应用运行时数据库连接 | 否 |
| `DIRECT_URL` | 迁移直连（线上需要） | 否 |
| `DEMO_REVIEW_CODE_HASH` | 校验评审者交换已付费演示 Session 的 review code | 否 |
| `DEMO_PAID_SESSION_TOKEN` | 仅服务端用于为固定合成数据 Session 下发 Cookie | 否 |
| `APP_BASE_URL` | E2E/回调基础地址 | `.env.example` 给示例 |
| `NODE_ENV` | 环境标识 | 平台设置 |

`.env.example` 只能包含安全占位值，不包含真实线上凭据。

浏览器模拟支付不使用环境变量 secret；其防护来自当前 HttpOnly Session、同源 Origin/CSRF 校验、共享限流、幂等键和数据库约束。`DEMO_REVIEW_CODE_HASH` 与演示 Session token 只服务于评审复验入口，不参与普通支付流程。

`APP_BASE_URL` 同时是写接口允许的唯一 Origin，必须按 URL 解析后比较 `scheme + host + port`，不得用字符串前缀判断。支付与 demo exchange 的限流状态必须存于 PostgreSQL 或平台跨实例存储；不得依赖单个 Serverless 实例内存。

## 6. CI/CD

Pull Request / push 至少执行：

1. 安装锁文件依赖。
2. Prisma generate。
3. 类型检查和 lint。
4. 单元/API 测试。
5. 使用临时 PostgreSQL 跑集成测试。
6. 可选：构建检查和关键 Playwright E2E。

只有检查通过才部署/合并。数据库迁移不得由每个 Serverless 实例启动时并发执行。

CI/部署网络若无法访问 Supabase 默认 IPv6 直连地址，应在实施前验证迁移路径，并使用 Supabase 提供的兼容连接方式；不得临时把运行时 transaction pooler URL直接用于 Prisma Migrate。

## 7. README 必备章节

1. 项目介绍与核心流程。
2. 线上 URL、健康检查和演示说明。
3. 技术栈及选择理由。
4. 架构图和目录结构。
5. ER 图与关键状态机。
6. 环境变量和本地启动。
7. 数据库迁移与 Seed。
8. API 文档与完整 cURL 流程。
9. 模拟支付调用及幂等说明。
10. 已支付测试 Session、review code 交换 Cookie 和对比方法。
11. 测试命令、覆盖场景、未覆盖项和理由。
12. CI 状态。
13. 健康算法和免责声明。
14. 安全、并发和事务设计。
15. AI 使用复盘。
16. 已知限制与未来演进。
17. 演示数据保留 30+7 天规则、`data:purge-expired` dry-run/执行命令和运行记录。

## 8. cURL 演示要求

README 中的脚本需使用 Cookie Jar，完整展示：

```text
创建 Session
→ 保存各步骤
→ complete
→ 获取免费结果并确认无保护字段
→ pay（带幂等键，身份来自 Cookie）
→ 再次获取完整结果
```

另提供独立复验命令：向 `/api/demo/session-exchange` 提交 review code，使用返回的 Cookie Jar 获取固定已付费 Session 的完整结果。命令不得打印真实 Session token。

命令必须在实际线上 URL 复验，不放不可执行的伪代码。

所有写请求示例必须显式发送 `Content-Type: application/json` 与 `Origin: ${APP_BASE_URL}`；支付重试复用原幂等键，新支付生成新键。

## 9. 数据库 Schema 图

交付至少包含 Session、Assessment、AssessmentResult、Subscription、Payment 的关系、基数和关键唯一约束。图应与最终 Prisma Schema 一致，可用 Mermaid 保持版本化，也可另附导出图片。

## 10. AI 使用复盘要求

复盘不是“AI 帮我写代码”的流水账，需要包含：

- AI 参与了哪些环节：需求拆解、Schema、Mock、算法、测试、文档。
- 人工如何验证：查公式、检查约束、运行测试、审阅迁移。
- 至少一个否决案例及理由。例如否决通用 EAV 问卷模型、前端遮罩保护完整结果、字符串保存预测曲线等不合适方案。
- AI 带来的效率提升与引入的风险。
- 哪些关键判断由开发者负责。

## 11. 最终交付清单

- [ ] 公网 URL 可访问并走完全流程。
- [ ] `/pay` 有可重放 cURL/Postman 调用。
- [ ] 已付费测试 Session 可用于对比。
- [ ] review code 只能换取固定合成数据 Session，且真实 token 不进入 URL、README 或响应体。
- [ ] GitHub 仓库及 README 完整。
- [ ] 自动化测试随代码提交，`npm test` 可运行。
- [ ] CI 通过并有状态证据。
- [ ] 数据库 Schema/ER 图与实现一致。
- [ ] AI 使用复盘含否决案例。
- [ ] 文档/邮件命名符合 `【姓名】_全栈挑战_YYYYMMDD`。
- [ ] 最终邮件发送前人工检查链接权限、secret 和个人信息。
- [ ] 过期数据清理脚本已在测试库复验，公开演示期清理责任和结束后清理时间已记录。

## 12. 发布前 Smoke

在无本地缓存的新浏览器会话中执行：

1. 打开首页并完成问卷。
2. 中途刷新一次确认恢复。
3. 故意输入一次非法数据确认错误。
4. 完成后检查免费响应无保护字段。
5. 执行模拟支付并检查完整结果。
6. 使用已付费测试 Session 直接对比。
7. 在全新 clone 中按 README 启动并运行测试。

任何 S0/S1 问题都阻断交付。

## 13. 实施参考

- Supabase：Serverless 运行时使用 transaction mode，迁移优先直连，并按提供方要求处理 prepared statements。
- Prisma：使用独立运行时池化连接和 CLI 直连配置；事务保持短小，不在事务中调用外部网络。
- Vercel：函数运行时使用连接池并复用客户端实例，部署前验证计划限制和数据库连接数。

最终配置以锁定依赖版本对应的官方文档和实际部署验证为准，不能只复制示例连接串。

## 14. 容量、性能与成本假设

本项目是面试演示，不伪造生产增长预测。发布验证采用以下工程假设：

| 项目 | MVP 目标/约束 |
|---|---|
| 预期同时在线评审者 | ≤10 |
| 验证容量 | 20 个并发 Session 可完成保存/读取 smoke，不要求正式压测报告 |
| 普通 API 性能 | 正常网络下 P95 <800ms |
| 预测曲线 | 每个 Result 最多 105 个 JSON 点 |
| 数据规模 | 演示期以 Seed + 评审产生数据为主，不承诺大规模生产容量 |
| 成本 | 面试题未给预算；默认仅使用已有/免费额度，不自动升级付费计划 |

若预计负载、免费配额或连接数不满足上述假设，部署负责人必须在产生费用前取得项目所有者确认。禁止为了达到虚假性能数字而隐藏错误或跳过持久化。

## 15. 灰度、降级、上线顺序与回滚

### 15.1 上线顺序

1. 在临时 PostgreSQL 验证迁移和 Seed。
2. 部署 Preview，运行类型检查、单元、集成和 E2E。
3. 备份/确认线上 Schema 状态，执行向前迁移。
4. 部署 Production 应用。
5. 运行 `/api/health`、免费流程、支付流程和已付费 Session smoke。
6. 确认监控无异常后发送交付链接。

### 15.2 灰度与降级

- Vercel Preview 是本项目的灰度环境；未通过 Preview 验收不得推到 Production。
- 可通过服务端环境开关关闭 `/api/demo/session-exchange`，不影响普通问卷和支付闭环。
- 数据库或写接口不可用时进入只读错误页，不在本地伪造保存成功。
- 结果曲线渲染失败时可降级为完整结果数值列表，但 API 权限裁剪不得降级。
- 监控/埋点失败不阻断测评，但不得影响主事务；记录为 S2 并在复盘处理。

### 15.3 回滚条件与方式

以下任一情况立即停止发布并回滚应用：S0 数据/权限问题、主流程不可用、数据库迁移导致读写失败、5xx 错误率 >5% 持续 5 分钟、免费结果出现保护字段。

- 应用回滚：切回上一个已通过 smoke 的 Vercel deployment。
- 数据库：优先使用兼容旧应用的扩展式迁移；如必须修复，执行已评审的补偿迁移，禁止 `reset` 线上库。
- Demo 数据：仅通过版本化 Seed/reset 脚本重建合成记录并轮换 token。
- 回滚后重新执行健康检查、免费结果权限和支付前后对比。

## 16. 上线观察与复盘

- 观察周期：交付后至少 24 小时，或直到评审确认完成，以较晚者为准。
- 发布后前 30 分钟由发布值守人完成两次 smoke；随后在 2 小时和 24 小时检查一次健康状态、5xx、连接错误和关键流程。
- S0/S1 立即处理并更新 README 已知问题；S2/S3 记录但不得隐瞒。
- 复盘时间：交付后 24 小时内形成简短记录，包含实际问题、AI 建议中被否决的内容、测试遗漏和后续动作。
- 后续负责人：候选人/发布值守人，直到交付观察期结束。
