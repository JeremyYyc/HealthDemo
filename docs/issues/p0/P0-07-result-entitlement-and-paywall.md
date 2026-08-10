# P0-07 免费/完整结果 DTO 与 Paywall

**标签**：`priority:P0` `type:feature` `area:api` `area:frontend` `risk:security`
**估算**：4h
**依赖**：P0-06

## 需求

按 Session 权益在服务端构造独立 Free/Full DTO，并实现免费摘要、锁定区和支付后重新拉取的结果页。

**PRD 条款**：[US-05](../../prd/01-master-prd.md#us-05-免费结果)、[API §7](../../prd/03-api-product-contract.md#7-获取结果)、[权限规格 §2–§4](../../prd/06-subscription-and-payment-spec.md#2-权限模型)、[Funnel §4.10](../../prd/02-funnel-and-screen-spec.md#410-结果页)。

## API

`GET /api/assessments/:id/result`：未完成 409，跨 Session/不存在统一 404，Result 不变量破坏返回 500 并记录 requestId；INACTIVE/EXPIRED 返回 FREE，ACTIVE 返回 FULL。

Free DTO 固定为：`assessmentId/accessLevel/bmi/bmiCategory/summary/isLocked/unlockableSections/algorithmVersion/disclaimer`。Full 在公共字段外增加 BMR、TDEE、建议摄入、周数、日期、曲线、下限标记。

## 数据约束

- 权益属于 Session，一次 ACTIVE 解锁该 Session 所有已完成 Assessment。
- 两类 DTO 使用独立严格 Schema/白名单；保护字段在 Free JSON 中必须不存在，不能是 null/空数组。
- 不从数据库完整对象直接透传；页面源数据和脚本不得预载保护字段。
- ACTIVE 在 MVP 中 `expiresAt=null`；EXPIRED 按 FREE。

## 测试

- [ ] `P0-07-T01` Free 响应精确匹配白名单，所有保护字段不存在。来源：[质量计划 §3.4](../../prd/07-quality-and-acceptance-plan.md#34-权限与支付)。
- [ ] `P0-07-T02` Full 响应包含权限矩阵全部字段。来源：同上。
- [ ] `P0-07-T03` 无 Session、其他 Session、未完成测评被正确拒绝且不可枚举。来源：同上。
- [ ] `P0-07-T04` 完成但 Result 缺失返回稳定 500，不临时重算。来源：[API §7](../../prd/03-api-product-contract.md#7-获取结果)。
- [ ] `P0-07-T05` 页面 HTML/预载状态/API 中均找不到保护字段；摘要仍展示 BMI 与分类。来源：[权限规格 §3–§4](../../prd/06-subscription-and-payment-spec.md#3-结果字段权限矩阵)。

## 完成定义

- [ ] DTO 快照/契约测试在序列化层断言“字段不存在”。
- [ ] 前端会员状态只来自重新 GET result，不自行升级。
