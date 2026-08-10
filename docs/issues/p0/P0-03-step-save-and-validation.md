# P0-03 分步保存、校验、失效与乐观锁

**标签**：`priority:P0` `type:feature` `area:api` `area:data` `risk:concurrency`
**估算**：6h
**依赖**：P0-01、P0-02、P0-10

## 需求

实现八个冻结步骤的服务端校验与增量保存；支持乱序、同值重放、返回修改和下游失效，保存失败时不推进状态。

**PRD 条款**：[US-02](../../prd/01-master-prd.md#us-02-分步保存)、[API §5](../../prd/03-api-product-contract.md#5-分步保存)、[数据规格 §7–§8](../../prd/04-data-and-state-spec.md#7-进度推导)、[算法规格 §1–§2、§6](../../prd/05-health-calculation-spec.md#1-输入模型)。

## API

`PATCH /api/assessments/:id/steps/:step`，步骤键固定为 `age-range`、`sex`、`goal`、`age`、`height`、`current-weight`、`target-weight`、`activity`。

- 请求必须含当前 `version`；成功返回 `savedStep/completedSteps/nextStep/invalidatedSteps/version`。
- 同值规范化重放优先于版本检查，返回 200、`replayed:true` 且不增版本；旧版本异值返回 409 `VERSION_CONFLICT`。
- 已完成返回 409 `ASSESSMENT_LOCKED`；跨 Session 或不存在统一 404。
- `age` 缺 `ageRange`，或目标体重缺 `goal/height/currentWeight`，返回 422 `STEP_PREREQUISITE_MISSING` 且不落库。
- 格式/范围错误 400；格式合法但跨字段失败 422 `BUSINESS_RULE_VIOLATION`。

## 数据约束

- 更新条件包含 `id + sessionId + version + IN_PROGRESS`，成功变更只递增一次版本。
- 保存 `ageRange` 后重验 `age`；保存 `goal/height/weight` 后重验 `targetWeight`；非法下游字段在同事务置空。
- 进度由八个字段的“非空且有效”推导，不能只信任 `currentStep` 缓存。
- 英制仅为 UI 输入；单位转换、规范到一位小数后，API 与数据库统一公制 Decimal。

## 测试

- [ ] `P0-03-T01` 八步骤的最小/最大/非法类型/小数精度覆盖，非法更新不写库不增版本。来源：[质量计划 §3.1、§3.2](../../prd/07-quality-and-acceptance-plan.md#31-健康计算)。
- [ ] `P0-03-T02` 同值旧版本重放成功，异值旧版本 409。来源：[质量计划 §3.2](../../prd/07-quality-and-acceptance-plan.md#32-分步保存与恢复)。
- [ ] `P0-03-T03` 修改 `ageRange` 使不匹配年龄失效并返回 `invalidatedSteps`。来源：同上。
- [ ] `P0-03-T04` 修改目标/身高/当前体重使非法目标体重失效。来源：同上。
- [ ] `P0-03-T05` 乱序非依赖步骤可保存且 nextStep 仍指第一缺口；依赖缺失则 422 不落库。来源：同上。
- [ ] `P0-03-T06` 两个相同版本并发异值更新仅一个成功。来源：[数据规格 §10](../../prd/04-data-and-state-spec.md#10-验收)。
- [ ] `P0-03-T07` 英制边界值转换、规范化、存储与回显一致。来源：[算法规格 §2](../../prd/05-health-calculation-spec.md#2-单位转换)。

## 完成定义

- [ ] 领域校验可脱离路由单测，事务行为由 PostgreSQL 集成测试覆盖。
- [ ] 前端可仅依赖响应字段决定下一步和失效提示，无需复制服务端业务规则。
