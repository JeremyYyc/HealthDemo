# P0-02 匿名 Session、恢复与重新测评 API

**标签**：`priority:P0` `type:feature` `area:api` `area:data`
**估算**：4h
**依赖**：P0-01、P0-10

## 需求

实现匿名 Session 创建/识别、进度恢复，以及完成后显式重新测评；Cookie 丢失、过期和篡改均有确定行为。

**PRD 条款**：[US-01、US-03](../../prd/01-master-prd.md#6-用户故事与验收标准)、[Funnel §4.1、§6](../../prd/02-funnel-and-screen-spec.md#41-欢迎与年龄分组)、[API 契约 §4](../../prd/03-api-product-contract.md#4-session-与恢复)。

## API

- `POST /api/sessions`：无有效 Cookie 返回 201 并原子创建 Session、Assessment、Subscription；已有进行中返回 200 原记录；只有完成记录时返回 `VIEW_RESULT`/`START_NEW`。
- `GET /api/session`：返回订阅摘要、确定性选中的 Assessment、答案、版本、完成步骤和下一步。
- `POST /api/assessments`：请求体必须为 `{}`；无进行中时 201，新建；已有时 200 幂等返回。
- 无 Cookie 返回 401；无效/篡改/过期 Cookie 返回 401 并清除 Cookie；Cookie 固定 30 天，不滚动续期。

## 数据约束

- 服务端仅保存 token 摘要；真实 token 只进 `HttpOnly; SameSite=Lax; Path=/` Cookie，生产为 Secure。
- 新 Session、首个 `IN_PROGRESS` Assessment 和 `INACTIVE` Subscription 同事务提交。
- 最近完成测评按 `completedAt DESC, id DESC` 决定。
- `hasSeenSession` 仅是前端非敏感提示标记，不参与鉴权，不含 token/ID/答案。

## 测试

- [ ] `P0-02-T01` 首次创建返回 201、Cookie 和三条一致记录。来源：[US-01](../../prd/01-master-prd.md#us-01-开始匿名测评)。
- [ ] `P0-02-T02` 重复入口调用返回原进行中测评且不覆盖 `ageRange`。来源：[API §4](../../prd/03-api-product-contract.md#4-session-与恢复)。
- [ ] `P0-02-T03` 只有已完成记录时不隐式新建，并返回两个明确动作。来源：[Funnel §4.1](../../prd/02-funnel-and-screen-spec.md#41-欢迎与年龄分组)。
- [ ] `P0-02-T04` 并发/重复新建最多产生一个进行中测评。来源：[数据规格 §10](../../prd/04-data-and-state-spec.md#10-验收)。
- [ ] `P0-02-T05` 过期/篡改 Cookie 返回 401、清 Cookie、不延长过期时间。来源：[API §4](../../prd/03-api-product-contract.md#4-session-与恢复)。
- [ ] `P0-02-T06` 恢复返回已保存答案，`nextStep` 指向第一缺口。来源：[质量计划 §3.2](../../prd/07-quality-and-acceptance-plan.md#32-分步保存与恢复)。

## 完成定义

- [ ] API 契约、Cookie 属性、事务与集成测试全部通过。
- [ ] 日志和响应均不出现 token 原文。
