# P0-12 自动化验收、CI、README 与部署

**标签**：`priority:P0` `type:feature` `area:test` `area:delivery`
**估算**：6h
**依赖**：P0-02～P0-11

**状态**：已完成；PR [#12](https://github.com/JeremyYyc/HealthDemo/pull/12) 已合并，最终验收见 [`docs/delivery/final-acceptance.md`](../../delivery/final-acceptance.md)。

## 需求

把各 Issue 的验收用例接入可重复执行的单元/Service/集成/API/E2E 测试、CI 和 Preview/Production 交付流程，并提供全新环境可执行的 README。

**PRD 条款**：[主 PRD §4.1(8–9)、§12](../../prd/01-master-prd.md#41-p0--must)、[质量计划 §2–§7](../../prd/07-quality-and-acceptance-plan.md#2-测试分层)、[部署规格 §4、§6–§16](../../prd/08-deployment-and-delivery-spec.md#4-本地复现要求)。

## API

- 契约测试覆盖 API-01～API-09 的正常、非法、未授权、重复及适用并发路径。
- README 必须链接版本化 Cookie Jar 演练；演练从创建 Session → 八步保存 → complete → Free → pay → Full，并提供独立 exchange 复验。
- 所有写示例显式发送 JSON Content-Type 与合法 Origin；支付重试复用原键。

## 数据约束

- CI 使用独立临时 PostgreSQL；测试不连接开发/生产库，不依赖共享 Seed。
- 固定时钟/随机种子；CI 不输出数据库 URL、Cookie、review code、token 或摘要。
- 迁移在空库和上一版本验证；部署迁移用 direct URL，运行时使用池化 URL。
- Preview 通过后才能 Production；迁移不由 Serverless 实例启动时执行。

## 测试

- [x] `P0-12-T01` `npm test`、`test:integration`、`test:e2e`、`test:coverage`、`check` 均可按 README 运行。来源：[质量计划 §6](../../prd/07-quality-and-acceptance-plan.md#6-冻结的一键命令)。
- [x] `P0-12-T02` 全部 P0 Issue 验收用例在 PR/CI 追踪表中有证据。来源：[质量计划 §4](../../prd/07-quality-and-acceptance-plan.md#4-需求追踪)。
- [x] `P0-12-T03` 总体 statements/lines/functions ≥80%，计算与权限分支 ≥90%，且所有 P0 用例通过。来源：[质量计划 §5](../../prd/07-quality-and-acceptance-plan.md#5-覆盖率与发布门槛)。
- [x] `P0-12-T04` Playwright 覆盖新访客、恢复、非法输入、支付解锁、Cookie 丢失和路由守卫。来源：[质量计划 §3.5](../../prd/07-quality-and-acceptance-plan.md#35-浏览器-e2e)。
- [x] `P0-12-T05` 全新 clone 按 README 及其 API 演练链接一次走通启动、迁移、Seed、测试和完整 cURL。来源：[部署规格 §4、§8](../../prd/08-deployment-and-delivery-spec.md#4-本地复现要求)。
- [x] `P0-12-T06` Preview 和 Production 执行 `/api/health`、Free/Full 权限、支付与 paid Session smoke。来源：[部署规格 §12、§15](../../prd/08-deployment-and-delivery-spec.md#12-发布前-smoke)。
- [x] `P0-12-T07` 任一 S0/S1、迁移失败、保护字段泄漏或关键 E2E 失败阻断发布。来源：[质量计划 §9](../../prd/07-quality-and-acceptance-plan.md#9-缺陷优先级)。

## 完成定义

- [x] CI 绿、Preview 验收记录完整、Production URL 可用。
- [x] 初始验收时 README 包含部署规格 §7 的完整内容；交付完成后按批准的信息架构变更保留摘要，并将 ER 图、完整 API、部署和运维细节下沉到版本化专项文档。
- [x] 最终验收记录填写 commit、URL、CI、测试数、Smoke、限制、监控与回滚复验。
