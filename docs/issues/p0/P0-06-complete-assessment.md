# P0-06 完成测评事务与结果快照

**标签**：`priority:P0` `type:feature` `area:api` `area:data` `risk:concurrency`
**估算**：4h
**依赖**：P0-01、P0-03、P0-05

## 需求

以单一事务完成最终校验、计算、唯一 Result 写入和 Assessment 状态变更；支持网络重试与并发 complete。

**PRD 条款**：[US-04](../../prd/01-master-prd.md#us-04-完成测评)、[API §6](../../prd/03-api-product-contract.md#6-完成测评)、[数据规格 §4、§8](../../prd/04-data-and-state-spec.md#4-assessment-状态机)。

## API

`POST /api/assessments/:id/complete` 请求 `{version}`。

- 缺失/失效字段返回 422 `ASSESSMENT_INCOMPLETE`，`requiredSteps` 按问卷顺序。
- 旧版本返回 409；跨 Session统一 404。
- 成功统一 200，仅返回完成元数据、`resultUrl`、版本和 `replayed`，不得内嵌任何 Result。
- 已完成重试忽略旧版本并返回同一元数据、`replayed:true`。

## 数据约束

- 事务中按顺序验证归属/状态/版本、全量校验、计算快照、创建 Result、条件更新 Assessment。
- 条件更新包含 `id + sessionId + version + IN_PROGRESS`。
- `AssessmentResult.assessmentId` 唯一；同版本并发只能生成一份结果。
- 任一步失败整体回滚，Assessment 保持进行中且无孤立 Result。
- `calculationDate` 在事务开始时固定为 UTC 日期。

## 测试

- [ ] `P0-06-T01` 字段完整时生成唯一 Result 并完成 Assessment。来源：[质量计划 §3.3](../../prd/07-quality-and-acceptance-plan.md#33-完成事务)。
- [ ] `P0-06-T02` 缺字段/跨字段非法时 422 且不生成 Result。来源：同上。
- [ ] `P0-06-T03` 注入计算或写入故障，事务完全回滚。来源：同上。
- [ ] `P0-06-T04` 旧版本及与最后一步保存并发时不得基于旧答案计算。来源：同上。
- [ ] `P0-06-T05` 同版本并发 complete 只有一个 Result，另一请求返回已有完成元数据。来源：同上。
- [ ] `P0-06-T06` 已完成重试不返回 Full Result、不创建新记录。来源：同上。

## 完成定义

- [ ] PostgreSQL 集成测试覆盖事务、锁等待/唯一冲突路径。
- [ ] 结果读取只能通过 API-05，complete 不形成权限旁路。
