# MVP PRD 冻结清单

> 冻结编号：`MVP-PRD-v1.0-20260805`  
> 冻结日期：2026-08-05  
> 状态：**Frozen**  
> 适用范围：Personalized Health Assessment 三天 MVP

## 1. 冻结声明

本清单所列文件构成 MVP v1.0 的完整需求基线。冻结后，开发、设计、测试和交付均以该基线为准；不得通过实现细节、口头约定或单份文档修改改变 P0 范围、用户状态、权限字段、算法、错误语义或验收门槛。

目录当前不是有效 Git 仓库，因此本次使用冻结编号与 SHA-256 作为内容基线。未来接入版本控制后，应将本清单与对应 commit/tag 一并保存。

## 2. 冻结文件与 SHA-256

| 文件 | 版本 | SHA-256 |
|---|---|---|
| `README.md` | v1.0 | `f871ad07d8147e6bb5e1ddb17dc0fce802b7581fd4a37a82dd6dabbf3a8fc7c9` |
| `01-master-prd.md` | v1.0 | `07277ba5698fcbad774ba7d4c3afe123a8f693789c04af826354fd409a98ab55` |
| `02-funnel-and-screen-spec.md` | v1.0 | `7d8a97b2f37ca4af39c97f0bcbe8407bdeca6c89a3f3c77b9d092d19af56784c` |
| `03-api-product-contract.md` | v1.0 | `a3b27c08ce913f3dd8f9410bc5905e8de312409c896d7d3b61a12ea3347fcc63` |
| `04-data-and-state-spec.md` | v1.0 | `d025b9851d719201c119a4aa3699b5735d31b47924291611e3a76d7132d0519a` |
| `05-health-calculation-spec.md` | v1.0 | `4f667d29f65a6ba7cdc8b12980bc3bb829a0f31400b57e1d0947f5b7cb023f5f` |
| `06-subscription-and-payment-spec.md` | v1.0 | `ff00043bc1cfcabde6dfd2fa9573370f1e8c92d2891af7d7e058229280a42133` |
| `07-quality-and-acceptance-plan.md` | v1.0 | `bf7993cb93236f20163747ae2288d8caf6e08e3ce76cf37ce9b04cfffe752a8b` |
| `08-deployment-and-delivery-spec.md` | v1.0 | `d1ad5d37713f89a92fbefe69b916c1467e21a2d5e281e142a185a9413585067a` |
| `09-prd-review-record.md` | v1.0 | `592e966cf2f825cda11dcc836835fc71aa64ee396424ec45267e2531a934eaca` |

`10-mvp-freeze-manifest.md` 不记录自身哈希，避免自引用导致哈希不可收敛。

## 3. 校验方法

在项目根目录运行：

```bash
shasum -a 256 docs/prd/README.md docs/prd/0[1-9]-*.md
```

输出必须与本清单逐项一致。任一不一致都表示冻结基线已改变，应先判断是无意修改还是已批准需求变更。

## 4. 变更与解冻规则

只有以下情况可以申请解冻：

1. 发现会导致 P0 无法实现、无法测试或相互矛盾的阻断缺陷。
2. 外部硬约束变化，例如题目要求、平台限制或安全问题导致当前方案不可执行。
3. 产品负责人明确批准范围、权限、算法或验收口径变化。

解冻时必须先新增 change note，至少记录：变更原因、用户影响、受影响文件、数据/接口兼容影响、测试变化、负责人和批准结论。完成跨文档同步 Review 后升级版本、生成新的冻结编号与全部哈希；禁止直接覆盖本次冻结记录后仍沿用原编号。

以下不要求解冻：不改变外部可观察行为的代码重构、变量名调整、排版修复和测试实现优化。但若修改了本清单中的文件，即使只是排版，也必须更新补丁版本和哈希，保证内容可追溯。

## 5. 冻结后开发入口

- 产品范围与 P0：`01-master-prd.md`
- 页面状态与异常恢复：`02-funnel-and-screen-spec.md`
- API、错误码和幂等：`03-api-product-contract.md`
- 数据约束与状态机：`04-data-and-state-spec.md`
- 健康计算：`05-health-calculation-spec.md`
- 权限和支付：`06-subscription-and-payment-spec.md`
- 自动化验收：`07-quality-and-acceptance-plan.md`
- 部署与发布：`08-deployment-and-delivery-spec.md`
- Review 结论：`09-prd-review-record.md`
