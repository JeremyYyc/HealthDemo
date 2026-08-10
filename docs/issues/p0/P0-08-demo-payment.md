# P0-08 Demo 支付、幂等与并发激活

**标签**：`priority:P0` `type:feature` `area:api` `area:data` `risk:security` `risk:concurrency`
**估算**：5h
**依赖**：P0-01、P0-07、P0-10

## 需求

实现当前匿名 Session 的同步 Demo payment，将 Subscription 从 INACTIVE 原子激活为 ACTIVE，覆盖重放、不同键并发和失败重试。

**PRD 条款**：[US-06](../../prd/01-master-prd.md#us-06-模拟支付与解锁)、[API §8 `/api/pay`](../../prd/03-api-product-contract.md#post-apipay)、[支付规格 §5–§8](../../prd/06-subscription-and-payment-spec.md#5-模拟支付流程)。

## API

`POST /api/pay` 请求 `{assessmentId,idempotencyKey}`，身份来自 Cookie，不接受状态或 Session ID。

- 键长 8–128，唯一域 `(sessionId,idempotencyKey)`；同键同指纹重放首次结果，同键异 Assessment 409。
- ACTIVE 后新键返回现有 `activationPaymentId`、`paymentCreated:false`，不预留记录。
- Assessment 必须属于当前 Session 且已完成。
- 每 Session 60 秒最多 10 次，超限 429 + `Retry-After`；同源 Origin 必须通过。

## 数据约束

- 首次成功在同事务创建唯一 `SUCCEEDED` Payment、设置 Subscription ACTIVE/activatedAt/activationPaymentId。
- 锁定/串行化同一 Subscription；不同幂等键并发只能一个创建 Payment。
- MVP 不持久化 PENDING/FAILED；事务失败不留半成品。
- 浏览器不持有 secret；日志只记录 Payment ID/requestId/状态。

## 测试

- [ ] `P0-08-T01` 支付成功激活权益，重新 GET 同一及同 Session 其他完成结果均为 FULL。来源：[支付规格 §8(3–4)](../../prd/06-subscription-and-payment-spec.md#8-验收场景)。
- [ ] `P0-08-T02` 同键同 Assessment 重放无副作用；同键换 Assessment 返回 409。来源：[质量计划 §3.4](../../prd/07-quality-and-acceptance-plan.md#34-权限与支付)。
- [ ] `P0-08-T03` 两个不同键并发首次支付只有一个成功 Payment，权益一致。来源：同上。
- [ ] `P0-08-T04` ACTIVE 后任意新键 no-op 且不建记录。来源：同上。
- [ ] `P0-08-T05` 两 Session 使用相同文本键各自处理，不泄露 Payment。来源：同上。
- [ ] `P0-08-T06` 事务故障整体回滚，同键可安全重试。来源：[支付规格 §8(7,10)](../../prd/06-subscription-and-payment-spec.md#8-验收场景)。
- [ ] `P0-08-T07` 无 Session/跨 Session/未完成/错误 Origin/超限分别返回冻结错误。来源：[支付规格 §6](../../prd/06-subscription-and-payment-spec.md#6-幂等与异常)。

## 完成定义

- [ ] 并发、唯一约束和回滚由真实 PostgreSQL 测试证明。
- [ ] 支付成功后 UI 重新请求 API-05，失败保留免费结果与原键重试能力。
