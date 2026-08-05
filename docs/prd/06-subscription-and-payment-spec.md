# 订阅权限与模拟支付规格

> 版本：v1.0 MVP Frozen

## 1. 目标

证明结果访问权限在服务端得到可靠保护，并通过可重放的模拟支付形成从免费摘要到完整报告的状态闭环。该能力仅用于挑战演示，不代表真实支付实现。

## 2. 权限模型

权益归属于当前匿名 Session，一次激活解锁该 Session 下所有已完成 Assessment。读取 Assessment 仍必须验证其属于该 Session；即使知道其他 Assessment ID 也不能读取。

| Subscription 状态 | 访问级别 |
|---|---|
| `INACTIVE` / 不存在 | `FREE` |
| `ACTIVE`（MVP `expiresAt = null`） | `FULL` |
| `EXPIRED` | `FREE` |

## 3. 结果字段权限矩阵

| 字段 | Free | Full |
|---|:---:|:---:|
| `assessmentId` | ✓ | ✓ |
| `accessLevel` | ✓ | ✓ |
| `bmi` | ✓ | ✓ |
| `bmiCategory` | ✓ | ✓ |
| 一般性摘要 | ✓ | ✓ |
| `isLocked` / 解锁提示 | ✓ | ✓ |
| `bmrKcal` | — | ✓ |
| `tdeeKcal` | — | ✓ |
| `recommendedCaloriesKcal` | — | ✓ |
| `estimatedWeeks` / `targetDate` | — | ✓ |
| `predictionCurve` | — | ✓ |
| `algorithmVersion` | ✓ | ✓ |
| 免责声明 | ✓ | ✓ |
| `calorieFloorApplied` | — | ✓ |

`—` 表示字段不能出现在 JSON 中，不能返回 `null`、空数组或模糊值后依赖前端隐藏。

为避免“摘要”由实现自由发挥，Free DTO 冻结为：`assessmentId`、`accessLevel`、`bmi`、`bmiCategory`、`summary`、`isLocked: true`、`unlockableSections`、`algorithmVersion`、`disclaimer`。`summary` 只能由 BMI 分类映射为中性的一般健康说明，不包含目标日期、预计周数、热量、代谢或曲线信息；`unlockableSections` 只返回固定类别名。Full DTO 包含上述公共字段（`isLocked: false`、`unlockableSections: []`）以及矩阵中的全部 Full 字段。两个 DTO 使用独立 Schema 做严格序列化，未知字段剔除视为测试失败而非容错策略。

## 4. Paywall 产品行为

- 免费摘要必须先提供真实价值，不只显示空白页。
- 锁定区仅说明可解锁内容类别，不在 HTML/脚本中预载真实保护数据。
- CTA 明确标注为 Demo payment，避免造成真实扣款误解。
- 支付成功后重新请求结果 API；前端状态不能自行伪造会员。
- 支付失败保留免费结果并允许重试。

## 5. 模拟支付流程

```text
用户点击 Demo Unlock
→ 前端生成/复用 idempotencyKey
→ POST /api/pay（当前 HttpOnly Session）
→ 服务端验证同源 Origin、共享限流和幂等键
→ 服务端验证 Assessment 归属与完成状态
→ 事务写入 SUCCEEDED Payment 并激活 Subscription
→ 返回 ACTIVE
→ 前端重新 GET result
→ 服务端返回 Full DTO
```

## 6. 幂等与异常

- 相同 `idempotencyKey` 重放返回同一 Payment 结果。
- 幂等键唯一域为当前 Session；已持久化的激活 Payment 键若搭配不同 `assessmentId` 返回 409，其他 Session 使用相同文本键互不影响。ACTIVE 后的 no-op 新键不创建或预留记录。
- 网络超时后重试不能生成重复交易或冲突权益。
- 已为 `ACTIVE` 时使用新幂等键返回现有权益和 `paymentCreated: false`，不创建第二条成功 Payment。
- 两个不同幂等键并发首次支付时，事务锁定/串行化同一 Subscription，只允许一个创建首次成功 Payment。
- Payment 与 Subscription 写入任一步失败，整个事务回滚。
- 未完成测评不能支付解锁，返回明确错误。
- 非本 Session 的 Assessment 返回 404。
- 缺少 Session 返回 401；跨站 Origin 返回 403；超过共享限流返回 429。
- Demo provider 同步完成：校验失败不创建 Payment，事务失败整体回滚；MVP 不持久化 `PENDING` 或 `FAILED`。
- `/api/pay` 每 Session 每 60 秒最多 10 次；超限返回 `Retry-After`，计数必须跨 Serverless 实例共享。

## 7. 安全边界

模拟接口不是生产支付 webhook。至少要求：

- 仅允许当前 Session 解锁自身权益。
- 浏览器不持有或发送服务端 secret；使用 SameSite Cookie、Origin/CSRF 校验以及数据库或平台共享限流。
- 不接受客户端直接提交 `subscriptionStatus: ACTIVE`。
- 日志记录 Payment ID、requestId 和状态，不记录 secret/token。
- 生产 README 明确说明真实支付需增加签名验证、金额/币种、订单状态、退款、重放窗口和 webhook 原始体校验。

### 7.1 已付费演示 Session

交付物提供合成数据的已付费 Session ID，同时提供 `POST /api/demo/session-exchange`。评审者用可轮换、限流的 review code 换取该演示 Session 的 HttpOnly Cookie；真实 token 不进入 URL、README 或响应体。该接口只能映射到固定演示 Session，不能选择任意 Session，生产化时必须关闭。

### 7.2 撤销、回滚与人工补偿

- MVP 没有真实资金流，因此不提供退款、撤销支付或用户自助取消订阅。
- API/数据库事务失败自动回滚，用户保留免费结果并可使用同一幂等键重试。
- 若合成演示 Session 被误激活、损坏或 token 泄漏，发布值守人运行版本化的 `demo:reset`/Seed 脚本重新生成演示数据并轮换 review code/token。
- 禁止直接在 Supabase 控制台手工修改单行状态作为正式补偿；如确需紧急处理，必须记录时间、原因、执行人、受影响 ID 和复验结果。
- 真实支付接入前必须另行设计退款、撤销、拒付和 webhook 对账，本 PRD 不授权实现这些能力。

## 8. 验收场景

1. 非会员结果仅含白名单字段。
2. 直接猜测 URL 或 Assessment ID 不能读取他人结果。
3. 支付成功后订阅变为 `ACTIVE`。
4. 重新请求同一结果返回完整字段。
5. 重放相同支付请求无副作用。
6. 并发支付最终只有一个幂等事件和一致权益。
7. 支付事务故障不会产生半成功状态。
8. 已付费 Seed Session 可被评审者按 README 复验。
9. review code 只能换取固定合成数据 Session，错误 code、超限和任意 Session ID 均被拒绝。
10. 支付事务失败后使用同一幂等键可安全重试；演示数据可通过受控 reset 脚本恢复。
11. 两个 Session 使用相同文本幂等键时各自处理，不发生冲突或信息泄漏。
12. 同 Session 已持久化的激活 Payment 键更换 Assessment 时返回 409，不返回第一次 Payment 详情作为成功；ACTIVE 后未持久化的 no-op 键不承担请求指纹记忆。
