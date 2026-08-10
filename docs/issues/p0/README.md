# P0 开发 Issue 包

> 基线：`MVP-PRD-v1.0-20260805`
> 用途：将冻结 P0 转成可排期、可开发、可验收的 Issue。本文和各 Issue 不修改 PRD 语义；冲突时以冻结 PRD 为准，并按 change note 流程处理。

## 使用规则

1. Issue 必须按“需求 → API → 数据约束 → 测试”评审；四部分未对齐不得开工。
2. PR 说明必须列出本 Issue 的验收用例 ID，并附自动化测试或人工复验结果。
3. 不允许以实现便利改变字段权限、状态转换、计算、错误码或幂等语义；发现矛盾先提交 PRD change note。
4. `P0-xx-Txx` 是本开发包中的稳定验收用例 ID；每条均回链冻结 PRD 的原始验收章节。
5. 一个 Issue 只有在其“完成定义”全部满足后才能关闭；“主路径可用”不能替代异常与并发用例。

## 建议标签

`priority:P0`、`type:feature`、`area:frontend`、`area:api`、`area:data`、`area:test`、`risk:security`、`risk:concurrency`、`blocked`

## Issue 索引与依赖

| 顺序 | Issue | 估算 | 依赖 | 主交付 |
|---:|---|---:|---|---|
| 1 | [P0-01 数据模型、迁移与数据库不变量](./P0-01-data-model-and-migrations.md) | 4h | — | Schema、迁移、约束 |
| 2 | [P0-05 健康计算引擎 v1](./P0-05-health-calculation-engine.md) | 4h | — | 纯函数与单测 |
| 3 | [P0-10 通用 API 防护、错误契约与健康检查](./P0-10-api-guardrails-and-health.md) | 4h | P0-01 | API-08、公共中间件 |
| 4 | [P0-02 匿名 Session、恢复与重新测评 API](./P0-02-session-and-assessment-lifecycle.md) | 4h | P0-01、P0-10 | API-01/02/07 |
| 5 | [P0-03 分步保存、校验、失效与乐观锁](./P0-03-step-save-and-validation.md) | 6h | P0-01、P0-02、P0-10 | API-03、领域校验 |
| 6 | [P0-04 八步 Funnel、单位切换与路由恢复](./P0-04-funnel-ui-and-recovery.md) | 6h | P0-02、P0-03 | 页面与交互闭环 |
| 7 | [P0-06 完成测评事务与结果快照](./P0-06-complete-assessment.md) | 4h | P0-01、P0-03、P0-05 | API-04 |
| 8 | [P0-07 免费/完整结果 DTO 与 Paywall](./P0-07-result-entitlement-and-paywall.md) | 4h | P0-06 | API-05、结果页 |
| 9 | [P0-08 Demo 支付、幂等与并发激活](./P0-08-demo-payment.md) | 5h | P0-01、P0-07、P0-10 | API-06 |
| 10 | [P0-09 已付费演示 Session、Seed 与交换入口](./P0-09-demo-session-exchange.md) | 3h | P0-08、P0-10 | API-09、Seed/reset |
| 11 | [P0-11 30+7 天数据清理](./P0-11-data-retention-and-purge.md) | 3h | P0-01 | purge dry-run/execute |
| 12 | [P0-12 自动化验收、CI、README 与部署](./P0-12-quality-ci-and-delivery.md) | 6h | P0-02～P0-11 | CI、E2E、交付证据 |

## P0 覆盖矩阵

| 主 PRD §4.1 P0 | 对应 Issue |
|---|---|
| 1. 匿名 Session 创建与识别 | P0-01、P0-02 |
| 2. 八步问卷 | P0-03、P0-04 |
| 3. 每步校验与持久化 | P0-03 |
| 4. 进度与答案恢复 | P0-02、P0-04 |
| 5. 服务端完成、计算并持久化 | P0-05、P0-06 |
| 6. 免费/会员服务端差异化返回 | P0-07 |
| 7. 可重放模拟支付与幂等变更 | P0-08 |
| 8. 核心自动化测试 | 各 Issue 自带测试；P0-12 汇总门禁 |
| 9. 公网部署与 README | P0-12 |
| 10. 公制/英制切换，公制入库 | P0-03、P0-04 |
| 11. 显式重新测评且至多一个进行中 | P0-01、P0-02 |
| 12. 返回修改、失败重试、并发保护 | P0-03、P0-04 |
| 13. 统一错误与健康检查 | P0-10 |
| 14. 已付费演示 Session 与 review code | P0-09 |
| 15. 过期清理与 dry-run | P0-11 |

## 全局关单门槛

- [x] [主 PRD §12](../../prd/01-master-prd.md#12-总体验收定义) 全部满足。
- [x] [质量计划 §5](../../prd/07-quality-and-acceptance-plan.md#5-覆盖率与发布门槛) 全部满足。
- [x] 所有 P0 Issue 的验收用例通过，PR 中可追溯到测试文件或复验记录。
- [x] API、Schema、前端行为和 README 没有偏离冻结契约。
