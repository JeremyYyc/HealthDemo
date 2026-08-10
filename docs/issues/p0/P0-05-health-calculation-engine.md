# P0-05 健康计算引擎 v1

**标签**：`priority:P0` `type:feature` `area:api` `area:test`
**估算**：4h
**依赖**：无

## 需求

实现确定性的纯领域计算：BMI/分类、Mifflin–St Jeor BMR、TDEE、建议摄入、目标周数/日期和预测曲线。

**PRD 条款**：[主 PRD G-03、US-04](../../prd/01-master-prd.md#2-产品目标与非目标)、[算法规格 §1–§11](../../prd/05-health-calculation-spec.md)、[质量计划 §3.1](../../prd/07-quality-and-acceptance-plan.md#31-健康计算)。

## API

本 Issue 提供被 API-04 调用的领域函数，不直接提供路由。输入必须为已规范化公制值与显式 `calculationDate`；输出匹配冻结 Result 字段。

## 数据约束

- BMI 显示一位小数；边界 18.5/25/30 分类准确。
- BMR/TDEE kcal 按 `Math.round` 等价规则；中间步骤不提前舍入。
- 推荐摄入先加减目标差，再 `max(1200, raw)`，最后舍入；仅 raw `<1200` 标记 floor。
- 目标方向、维持 ±2kg、目标 BMI 15–50、最多 104 周严格校验。
- UTC date-only；曲线 0～104 周、最多 105 点，末点精确等于目标体重。
- 输出 `algorithmVersion:"v1"`；同输入、日期、版本完全确定。

## 测试

- [ ] `P0-05-T01` 男女公式与五档活动系数。来源：[算法规格 §4、§10](../../prd/05-health-calculation-spec.md#4-bmr-与-tdee)。
- [ ] `P0-05-T02` 年龄、身高、体重全边界及 NaN/Infinity 领域调用。来源：[算法规格 §10](../../prd/05-health-calculation-spec.md#10-必测边界)。
- [ ] `P0-05-T03` BMI 18.5/25/30 和显示舍入。来源：同上。
- [ ] `P0-05-T04` 三种目标方向、维持容差、目标 BMI、104 周上限。来源：同上。
- [ ] `P0-05-T05` `.5` kcal、raw=1200 与 raw<1200 的值及标记。来源：同上。
- [ ] `P0-05-T06` 跨月/年/闰年/时区、维持曲线、末点与 105 点上限。来源：同上。
- [ ] `P0-05-T07` 固定输入和日期重复运行输出一致。来源：[算法规格 §8](../../prd/05-health-calculation-spec.md#8-算法版本与可重复性)。

## 完成定义

- [ ] 领域模块无数据库、网络和系统当前时间依赖。
- [ ] 失败返回可映射到字段的业务错误，不自动修正目标。
