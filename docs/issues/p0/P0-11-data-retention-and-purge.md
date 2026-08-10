# P0-11 30+7 天数据清理

**标签**：`priority:P0` `type:feature` `area:data` `risk:security`
**估算**：3h
**依赖**：P0-01

## 需求

实现版本化 `data:purge-expired` dry-run/执行脚本，按 Session 创建 30 天失效 + 最迟 7 天保留规则清理关联演示数据，并输出非敏感审计汇总。

**PRD 条款**：[主 PRD §4.1(15)、冻结决策 18](../../prd/01-master-prd.md#41-p0--must)、[数据规格 §9](../../prd/04-data-and-state-spec.md#9-数据生命周期与隐私)、[部署规格 §7、§11](../../prd/08-deployment-and-delivery-spec.md#7-readme-必备章节)。

## API

无公网 API。提供 npm 命令支持 dry-run（默认推荐）与显式 execute；退出码和汇总格式稳定，便于 CI/人工复验。

## 数据约束

- 只选择 `Session.expiresAt <= calculationTime - 7 days`；固定时间输入便于测试。
- 在短事务中按显式外键顺序删除 Payment、Result、Assessment、Subscription、Session；不依赖未评估级联。
- dry-run 不写库；重复 execute 幂等；未到期/刚过期未满 7 天数据必须隔离。
- 审计只输出候选/删除数量、时间和结果，不输出 token、ID 清单或健康字段。

## 测试

- [ ] `P0-11-T01` dry-run 返回正确候选数且数据库零变更。来源：[质量计划 §7](../../prd/07-quality-and-acceptance-plan.md#7-测试数据与隔离)。
- [ ] `P0-11-T02` 30 天前、30 天整、30+7 天边界按冻结规则选择。来源：[数据规格 §9](../../prd/04-data-and-state-spec.md#9-数据生命周期与隐私)。
- [ ] `P0-11-T03` execute 清理所有关联实体且不违反外键。来源：[数据规格 §10](../../prd/04-data-and-state-spec.md#10-验收)。
- [ ] `P0-11-T04` 未到期和保留期内 Session 完整保留。来源：同上。
- [ ] `P0-11-T05` 重复执行幂等；失败事务不留下部分删除。来源：同上。

## 完成定义

- [ ] README 写明 dry-run、正式执行、每 7 天和评审结束后的责任/记录方式。
- [ ] 测试只连接独立测试库，正式执行需要显式确认参数。
