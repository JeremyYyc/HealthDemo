# P0-01 数据模型、迁移与数据库不变量

**标签**：`priority:P0` `type:feature` `area:data` `risk:concurrency`
**估算**：4h
**依赖**：无

## 需求

建立 Session、Assessment、AssessmentResult、Subscription、Payment 的 Prisma Schema、关系、枚举与可向前执行的迁移，为后续接口提供数据库级最后防线。

**PRD 条款**：[主 PRD §4.1(1,5,7,11,15)](../../prd/01-master-prd.md#41-p0--must)、[数据规格 §2–§6](../../prd/04-data-and-state-spec.md#2-核心实体)、[数据规格 §9.1](../../prd/04-data-and-state-spec.md#91-历史数据与兼容)。

**不在本 Issue**：Session 路由、支付业务流程、清理脚本实现。

## API

不直接提供路由；Schema 必须能无损支持 [API-01～API-09](../../prd/03-api-product-contract.md#2-mvp-冻结接口清单)，DTO 不得直接序列化 Prisma Decimal/Date。

## 数据约束

- `Session.tokenHash` 唯一，`expiresAt` 为创建后 30 天的绝对到期时间。
- `AssessmentResult.assessmentId` 唯一；Result 保存 `calculationDate`、`algorithmVersion` 与全部冻结快照字段。
- `Payment(sessionId, idempotencyKey)` 复合唯一，`transactionId` 全局唯一；禁止 `idempotencyKey` 全局唯一。
- 每 Session 至多一个 Subscription、一个 `IN_PROGRESS` Assessment、一个首次 `SUCCEEDED` Payment；实现 PostgreSQL 部分唯一索引。
- Subscription 的 `activationPaymentId` 可空且唯一；Session 创建事务可预建 `INACTIVE` 行。
- 使用枚举和 Decimal/Numeric；删除采用 Restrict/显式顺序；迁移不得用 `db push` 代替。

## 测试

- [ ] `P0-01-T01` 空库执行全部迁移成功，ER 图与 Prisma Schema 一致。来源：[数据规格 §10](../../prd/04-data-and-state-spec.md#10-验收)。
- [ ] `P0-01-T02` 同一 Session 插入第二个 `IN_PROGRESS` Assessment 被数据库拒绝。来源：[质量计划 §7](../../prd/07-quality-and-acceptance-plan.md#7-测试数据与隔离)。
- [ ] `P0-01-T03` 同一 Session 插入第二个 Subscription 或第二个首次成功 Payment 被拒绝。来源：[数据规格 §6](../../prd/04-data-and-state-spec.md#6-数据约束)。
- [ ] `P0-01-T04` 两个 Session 可使用相同文本幂等键，且查询不会跨 Session。来源：[数据规格 §10](../../prd/04-data-and-state-spec.md#10-验收)。
- [ ] `P0-01-T05` 上一版本 Schema 可向前迁移，旧 `algorithmVersion` Result 仍按快照读取。来源：[数据规格 §9.1、§10](../../prd/04-data-and-state-spec.md#91-历史数据与兼容)。

## 完成定义

- [ ] Schema、SQL 迁移和 ER 图同一 PR 提交。
- [ ] 约束由真实 PostgreSQL 集成测试证明，不以 mock 代替。
- [ ] 迁移不包含破坏性 reset，回退策略写入 PR。
