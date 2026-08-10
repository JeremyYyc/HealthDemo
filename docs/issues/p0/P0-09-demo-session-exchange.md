# P0-09 已付费演示 Session、Seed 与交换入口

**标签**：`priority:P0` `type:feature` `area:api` `area:data` `risk:security`
**估算**：3h
**依赖**：P0-08、P0-10

## 需求

提供可版本化重建的合成 paid/unpaid Seed、受控 review code 交换入口和 demo reset，让评审者可复验完整权限而不接触真实 token。

**PRD 条款**：[US-07](../../prd/01-master-prd.md#us-07-评审与复现)、[API §8 session-exchange](../../prd/03-api-product-contract.md#post-apidemosession-exchange)、[支付规格 §7.1–§7.2](../../prd/06-subscription-and-payment-spec.md#71-已付费演示-session)、[部署规格 §5、§8](../../prd/08-deployment-and-delivery-spec.md#5-环境变量清单)。

## API

`POST /api/demo/session-exchange` 只接受 `{reviewCode}`，不接受 Session/Assessment ID。

- 正确 code 只映射固定 paid 合成 Session 并下发 HttpOnly Cookie；响应/URL 不含 token。
- 错误 code 统一 401 `INVALID_REVIEW_CODE`。
- 功能关闭、配置缺失或固定 Session 无效统一 503 `DEMO_EXCHANGE_UNAVAILABLE`。
- 每来源 IP 15 分钟最多 5 次，429 + `Retry-After`；生产化可关闭。

## 数据约束

- `DEMO_REVIEW_CODE_HASH` 和 `DEMO_PAID_SESSION_TOKEN` 只在服务端环境；仓库只有占位值。
- 来源 IP 只保存不可逆摘要；日志不得记录 code/token 或其摘要。
- Seed 生成确定的完整 Assessment/Result、ACTIVE Subscription 和一致的激活 Payment；reset 轮换凭证并重建合成数据。

## 测试

- [ ] `P0-09-T01` 正确 code 获得 Cookie 后可读取固定 Session 的 Full Result。来源：[质量计划 §3.4](../../prd/07-quality-and-acceptance-plan.md#34-权限与支付)。
- [ ] `P0-09-T02` 错误 code、任意 Session ID、超限和跨站请求被拒绝。来源：[支付规格 §8(9)](../../prd/06-subscription-and-payment-spec.md#8-验收场景)。
- [ ] `P0-09-T03` 关闭/缺配置/Seed 损坏均返回相同 503 且不泄露固定 Session。来源：[API §8](../../prd/03-api-product-contract.md#post-apidemosession-exchange)。
- [ ] `P0-09-T04` 响应、URL、README、CI 日志均不含 token、真实 code 或摘要。来源：[质量计划 §7](../../prd/07-quality-and-acceptance-plan.md#7-测试数据与隔离)。
- [ ] `P0-09-T05` `demo:reset` 可重复执行并轮换凭证，复验后结果仍为 FULL。来源：[支付规格 §7.2](../../prd/06-subscription-and-payment-spec.md#72-撤销回滚与人工补偿)。

## 完成定义

- [ ] Seed/reset 和 README 复验命令同 PR 更新。
- [ ] exchange 有服务端关闭开关且普通支付不依赖它。
