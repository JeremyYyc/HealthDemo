# Health Assessment PRD 文档集

> 状态：**MVP Frozen v1.1**（用户逻辑、异常处理与跨文档契约已冻结）
> 日期：2026-08-06
> 项目：全栈开发 3 天挑战  
> 产品暂定名：Personalized Health Assessment
> 冻结编号：`MVP-PRD-v1.1-20260806`

## 1. 文档目的

本目录将挑战题、技术讨论、部署方案和 BetterMe Quiz Funnel 的参考体验整理为一组可执行、可测试的 MVP 产品需求。文档优先服务于 3 天 MVP 的设计、开发、测试、部署和面试讲解。

**冻结规则**：v1.0 之后只接受阻断开发/验收的勘误。任何范围、字段权限、状态转换、计算规则或错误语义变化都视为需求变更，必须先更新主 PRD、受影响专项文档和测试追踪，再实施代码。

参考站仅用于提炼分步问卷、进度反馈、结果预览和订阅解锁体验；本项目不要求也不应 1:1 复制 BetterMe。

## 2. 文档导航

| 文档 | 说明 | 主要读者 |
|---|---|---|
| [01-master-prd.md](./01-master-prd.md) | 产品目标、范围、用户故事、优先级、指标和总体验收 | 全员 |
| [02-funnel-and-screen-spec.md](./02-funnel-and-screen-spec.md) | Funnel 用户流程、页面需求、恢复与异常交互 | 产品、前端、测试 |
| [03-api-product-contract.md](./03-api-product-contract.md) | 面向产品行为的 API 契约、错误语义和幂等要求 | 后端、前端、测试 |
| [04-data-and-state-spec.md](./04-data-and-state-spec.md) | 核心实体、状态机、数据一致性和并发规则 | 后端、测试 |
| [05-health-calculation-spec.md](./05-health-calculation-spec.md) | 健康算法、输入边界、输出及免责声明 | 后端、产品、测试 |
| [06-subscription-and-payment-spec.md](./06-subscription-and-payment-spec.md) | 免费/会员权限矩阵、模拟支付闭环与安全要求 | 后端、前端、测试 |
| [07-quality-and-acceptance-plan.md](./07-quality-and-acceptance-plan.md) | 测试策略、重点用例、发布门槛和需求追踪 | 开发、测试、面试官 |
| [08-deployment-and-delivery-spec.md](./08-deployment-and-delivery-spec.md) | 公网部署、本地复现、README 和最终交付清单 | 开发、评审者 |
| [09-prd-review-record.md](./09-prd-review-record.md) | PRD Review 清单逐项结论、证据、责任人与遗留项 | 全员 |
| [10-mvp-freeze-manifest.md](./10-mvp-freeze-manifest.md) | 冻结范围、文件哈希、校验方式和解冻规则 | 全员 |
| [changes/2026-08-06-observation-window.md](./changes/2026-08-06-observation-window.md) | 将交付观察窗口由 24 小时调整为 12 小时的批准记录 | 全员 |

## 3. 统一优先级

- `P0 / Must`：不具备则挑战题不成立或无法验收。
- `P1 / Should`：显著提升工程质量或演示完整性，原则上纳入 3 天版本。
- `P2 / Could`：时间允许再做，不得挤占 P0。
- `Won't`：明确不在本次范围。

## 4. 统一术语

| 术语 | 定义 |
|---|---|
| Session | 识别匿名访问者的服务端会话；浏览器通过 HttpOnly Cookie 持有不透明 token |
| Assessment | 一次独立健康测评及其分步答案和进度 |
| Assessment Result | 测评完成后由服务端计算并持久化的结果快照 |
| Subscription | 用户/会话当前的会员权益状态 |
| Payment | 一次模拟支付事件，负责把订阅状态推进为有效 |
| Free Result | 非会员可见的摘要 DTO，不包含受保护字段 |
| Full Result | 有效会员可见的完整 DTO |

## 5. 已冻结假设与产品决策

以下均为本次 MVP 的冻结决策，不冒充挑战题原文的硬性要求；若实现需要改变，必须同步更新所有专项文档和测试：

1. MVP 使用匿名 Session，不实现账号注册登录；Cookie 有效期为 30 天，清理 Cookie 或更换浏览器后无法恢复。
2. 精确年龄范围为 18–100 岁，产品不服务未成年人。
3. MVP 仅正式支持减重、维持体重、增重三个目标。
4. 已完成的测评不可原地修改；重新测评会创建新的 Assessment。
5. 模拟支付仅依赖当前 HttpOnly Session、同源请求校验和幂等键，不把服务端 secret 暴露给浏览器。
6. 订阅权益归属于 Session，一次激活解锁该 Session 下所有已完成测评。
7. 预测曲线属于受保护字段；免费用户只能获得摘要字段。
8. 预测周期最多 104 周，超出时拒绝目标并提示调整。
9. 所有健康结果仅为技术演示，不构成医疗、营养或诊断建议。
10. 同一 Session 最多一个进行中测评；新建测评接口若发现进行中记录，幂等返回该记录。
11. 支付幂等键仅在 Session 内唯一，禁止跨 Session 重放或返回其他 Session 的 Payment。
12. 相同值的步骤重放可在旧版本下幂等成功；旧版本提交不同值必须返回版本冲突。
13. MVP 的 ACTIVE 订阅不自动过期；`expiresAt = null`，`EXPIRED` 仅保留为未来状态。
14. 首次访问与 Cookie 丢失通过非敏感本地标记区分；标记只表示“曾有会话”，不包含身份或健康数据。

决策依据和完整口径记录在主 PRD 的“已冻结产品决策”章节。
