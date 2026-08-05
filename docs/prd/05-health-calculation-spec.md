# 健康计算与验证规格

> 版本：v1.0 MVP Frozen  
> 重要：仅用于技术演示，不构成医疗、营养或诊断建议。

## 1. 输入模型

| 字段 | 类型与范围 | 规则 |
|---|---|---|
| `ageRange` | `18_29` / `30_39` / `40_49` / `50_100` | 必须包含精确年龄 |
| `sex` | `FEMALE` / `MALE` | 用于 Mifflin–St Jeor 常数 |
| `age` | 整数 18–100 | 与 ageRange 一致 |
| `heightCm` | 100–250，最多 1 位小数 | 必须有限，不接受 NaN/Infinity |
| `weightKg` | 30–350，最多 1 位小数 | 必须有限 |
| `targetWeightKg` | 30–350，最多 1 位小数 | 同时做目标与 BMI 交叉校验 |
| `goal` | 三种目标枚举 | 决定热量差和目标方向 |
| `activityLevel` | 五档枚举 | 映射活动系数 |

非法 JSON 类型、数字字符串、`null`、缺失、负数、0、超范围、小数精度过多均拒绝。最多一位小数按数学值判断，不依赖 JSON 原始文本；实现需容许合理浮点误差。JSON 无法原生表达 NaN/Infinity，但领域函数单测仍需直接覆盖。

所有方向、BMI 和周数校验都使用完成单位转换后规范到一位小数的领域值；前后端不得分别用未规范化显示值做出不同结论。

## 2. 单位转换

- `cm = (feet × 12 + inches) × 2.54`
- `kg = lb × 0.45359237`
- 输入可显示英制，但 API/数据库只接收规范化公制值。
- 转换后再按统一规则规范到一位小数；计算内部尽量使用未过早舍入的值。
- 先完成单位转换和统一舍入，再执行公制范围及业务校验；边界附近不得因前后端舍入顺序不同得到不同结论。

## 3. BMI

```text
BMI = weightKg / (heightCm / 100)^2
```

| 范围 | 分类 |
|---:|---|
| `< 18.5` | `UNDERWEIGHT` |
| `18.5–<25` | `NORMAL` |
| `25–<30` | `OVERWEIGHT` |
| `>= 30` | `OBESITY` |

API 展示保留 1 位小数；测试边界必须验证 18.5、25、30 的归类。数据库可保存更高精度或确定的 Decimal 快照。

## 4. BMR 与 TDEE

采用 Mifflin–St Jeor：

```text
Male BMR   = 10w + 6.25h - 5a + 5
Female BMR = 10w + 6.25h - 5a - 161
TDEE       = BMR × activityFactor
```

| 活动水平 | 系数 |
|---|---:|
| `SEDENTARY` | 1.2 |
| `LIGHT` | 1.375 |
| `MODERATE` | 1.55 |
| `ACTIVE` | 1.725 |
| `VERY_ACTIVE` | 1.9 |

BMR、TDEE 的 API 输出按 `Math.round` 等价规则取最接近整数 kcal（恰为 `.5` 时向正无穷方向取整）；内部计算不要在每一中间步骤舍入。

## 5. 建议每日摄入

```text
LOSE_WEIGHT     = TDEE - 500
MAINTAIN_WEIGHT = TDEE
GAIN_WEIGHT     = TDEE + 300
```

统一设置 1200 kcal/day 的演示安全下限。先使用未舍入 TDEE 加减目标热量差，再取 `max(1200, rawRecommendation)`，最后按上述规则舍入为整数；只有 `rawRecommendation < 1200` 时 `calorieFloorApplied: true`，恰等于 1200 时为 `false`。该规则并非个体医疗建议，需在代码常量、测试和 README 中明确。

## 6. 目标体重交叉校验

| 目标 | 规则 |
|---|---|
| 减重 | `targetWeightKg < weightKg` |
| 维持 | `abs(targetWeightKg - weightKg) <= 2` |
| 增重 | `targetWeightKg > weightKg` |

通用规则：

- `targetBMI = targetWeightKg / heightMeters²` 必须在 15–50 范围内。
- 按对应速度计算出的 `estimatedWeeks` 不得超过 104 周；即减重差值最多 52kg，增重差值最多 26kg。
- 任何失败均返回可解释的业务错误，不自动篡改用户目标。

## 7. 目标日期与预测曲线

为优先保证可解释和可测试，v1 使用固定安全速度：

- 减重：0.5 kg/周。
- 增重：0.25 kg/周。
- 维持：目标日期可为空，预计周数为 0。

```text
weeks = ceil(abs(weightKg - targetWeightKg) / weeklyRate)
targetDate = calculationDate + weeks × 7 days
```

预测曲线按每周生成一个点，并确保最后一个点精确等于目标体重。最大预测周期为 104 周，因此曲线最多 105 个点（包含 week 0）；超过 104 周的目标在校验阶段拒绝，不截断、不生成部分曲线。维持体重场景的曲线只包含 week 0。

`calculationDate` 取完成事务开始时的 UTC 日期，并持久化为 Result 的 date-only 基准。曲线中间点按固定速度计算后展示 1 位小数，使用 Decimal/等价十进制规则避免二进制漂移；最后一点无条件使用已规范化的 `targetWeightKg`。若差值不能整除周速度，最后一周只走剩余差值，不越过目标。

建议曲线结构：

```json
[
  { "week": 0, "date": "2026-08-05", "weightKg": 80.0 },
  { "week": 1, "date": "2026-08-12", "weightKg": 79.5 }
]
```

## 8. 算法版本与可重复性

- Result 保存 `algorithmVersion: "v1"`。
- 计算函数接收显式 `calculationDate`，使用 UTC 的 `YYYY-MM-DD` date-only 语义，测试不得依赖系统当前时间或部署地区时区。
- 同一输入、同一日期、同一版本必须产生相同结果。
- 公式更新不回写历史结果；新测评使用新版本。

## 9. 冻结结果字段

| 字段 | 描述 |
|---|---|
| `bmi` / `bmiCategory` | 当前 BMI 与分类 |
| `bmrKcal` | 基础代谢估算 |
| `tdeeKcal` | 活动调整后的消耗估算 |
| `recommendedCaloriesKcal` | 目标对应建议摄入 |
| `targetDate` / `estimatedWeeks` | 目标预测 |
| `predictionCurve` | 每周预测点 |
| `algorithmVersion` | 公式版本 |
| `disclaimer` | 非医疗声明 |
| `calorieFloorApplied` | 是否实际触发 1200 kcal 下限 |

## 10. 必测边界

- 年龄：17、18、100、101、20.5、缺失、NaN、Infinity。
- 身高：0、负数、99.9、100、250、250.1、极小正数。
- 体重：29.9、30、350、350.1、0、负数。
- BMI 分类边界：18.5、25、30。
- 目标方向错误、维持超出 ±2kg、目标 BMI <15 或 >50、预测周期超过 104 周。
- 五档活动系数与男女公式。
- 热量下限是否正确触发。
- `.5` kcal 舍入、恰等于 1200 与低于 1200 的下限标记。
- 预测日期跨月/跨年/闰年、UTC 时区、维持目标、曲线终点和 105 点上限。
- 确定性：固定日期重复计算输出相同。

## 11. 已冻结规则

- 1200 kcal 下限保持统一，以避免伪装专业建议。
- 预测速度使用固定速度，不根据热量差动态推导。
- 目标 BMI 不在 15–50 时拒绝。
- 预测周期超过 104 周时拒绝，不截断曲线。
