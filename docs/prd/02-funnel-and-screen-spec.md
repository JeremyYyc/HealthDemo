# Funnel 与页面需求规格

> 版本：v1.0 MVP Frozen  
> 目标：定义用户可见流程、页面状态和异常交互；不要求像素级复刻竞品。

## 1. 体验原则

1. **一次只问一件事**：降低认知负担。
2. **先保存再前进**：数据库确认成功才切换下一步。
3. **进度可感知**：显示当前步骤、总步骤和返回入口。
4. **文案可信克制**：不承诺医疗效果，不制造虚假紧迫感。
5. **异常可恢复**：失败留在原页、保留输入并提供重试。
6. **移动优先**：单列布局，主要操作在拇指可达区域。

## 2. 信息架构

```text
/
├── 欢迎与年龄分组
├── /quiz/[step]
│   ├── sex
│   ├── goal
│   ├── age
│   ├── height
│   ├── current-weight
│   ├── target-weight
│   └── activity
├── /generating
└── /result
    ├── 免费摘要 + Paywall
    └── 完整报告（订阅有效）
```

具体 URL 可在实现时调整，但浏览器后退、刷新和直接访问不得破坏状态。

## 3. 标准流程

| 序号 | 页面/步骤 | 输入 | 成功后行为 |
|---:|---|---|---|
| 1 | 欢迎/年龄分组 | `18–29`、`30–39`、`40–49`、`50+` | 创建/恢复 Session，保存年龄分组 |
| 2 | 性别 | `FEMALE`、`MALE` | 保存并进入目标 |
| 3 | 主要目标 | `LOSE_WEIGHT`、`MAINTAIN_WEIGHT`、`GAIN_WEIGHT` | 保存并进入精确年龄 |
| 4 | 精确年龄 | 18–100 的整数 | 保存并进入身高 |
| 5 | 身高 | cm 或 ft/in | 转换并保存 `heightCm` |
| 6 | 当前体重 | kg 或 lb | 转换并保存 `weightKg` |
| 7 | 目标体重 | kg 或 lb | 跨字段校验后保存 `targetWeightKg` |
| 8 | 活动水平 | 5 档枚举 | 保存并进入生成页 |
| 9 | 生成计划 | 无 | 调用 complete，成功后进入结果 |
| 10 | 结果 | 无 | 根据订阅状态显示免费或完整视图 |

## 4. 页面详细需求

### 4.1 欢迎与年龄分组

**内容**：Logo/产品名、简短价值主张、四个年龄分组选项、条款与隐私提示。  
**交互**：页面先调用恢复接口。确认没有可恢复 Session 后才展示年龄分组并允许提交；点击选项后立即提交，按钮显示 loading 并防重复点击。  
**验收**：已有 `IN_PROGRESS` Assessment 时优先恢复，并提示“继续上次测评”；已有完成测评时提供“查看结果”和“重新测评”。

Session Cookie 自创建起固定有效 30 天，不滚动续期。浏览器在成功创建 Session 后写入非敏感 `hasSeenSession=true` 标记；它不包含 token、ID、答案或结果。无有效 Cookie 且标记存在时，页面说明旧进度无法恢复并等待用户确认后开始；Cookie 与标记均不存在时视为首次访问，不显示误导性丢失提示。更换浏览器无法识别旧会话，按首次访问处理。

### 4.2 性别

**问题**：What is your sex for this calculation?  
**说明**：仅用于演示中的代谢估算，不代表完整性别身份模型。  
**MVP 选项**：Female、Male。  
**待办**：若加入 `Prefer not to say`，必须同步定义可计算公式，不能仅加前端选项。

### 4.3 主要目标

**选项**：Lose weight、Maintain weight、Gain weight。  
**约束**：不展示系统不能真实支持的 “Improve fitness” 等目标。  
**后续影响**：决定目标体重的方向校验、建议热量和预测模型。

### 4.4 精确年龄

- 数字输入，整数，18–100。
- 即时提示不替代服务端校验。
- 错误文案示例：`Please enter a whole-number age between 18 and 100.`
- 年龄分组严格映射为 `18–29`、`30–39`、`40–49`、`50–100`。
- 与年龄分组不一致时阻止提交并提示修正，不静默改写。

### 4.5 身高

- 支持 Metric（cm）和 Imperial（ft + in）切换。
- 公制范围 100–250cm，最多一位小数。
- 切换单位时转换当前有效值，不清空输入。
- 数据库与 API 领域模型统一使用 `heightCm`。

### 4.6 当前体重

- 支持 kg/lb；领域模型统一使用 `weightKg`。
- 范围 30–350kg，最多一位小数。
- 错误文案需要说明范围与当前单位。

### 4.7 目标体重

- 单字段范围 30–350kg，最多一位小数。
- 与当前体重、目标和身高进行跨字段校验。
- 错误应具体，例如 “For a weight-loss goal, target weight must be below current weight.”
- 不允许前端用确认弹窗绕过服务端拒绝规则。

### 4.8 活动水平

| 枚举 | 页面文案 |
|---|---|
| `SEDENTARY` | Little or no exercise |
| `LIGHT` | Exercise 1–3 days/week |
| `MODERATE` | Exercise 3–5 days/week |
| `ACTIVE` | Exercise 6–7 days/week |
| `VERY_ACTIVE` | Very intense exercise or physical job |

### 4.9 生成计划

显示 1–2 秒前端过渡反馈，例如：分析身体指标、计算热量目标、生成预测时间线。后端不得为了动画故意 sleep。

- 首次进入调用完成接口。
- 成功：跳转结果页。
- 校验失败：回到对应缺失/错误步骤。
- 网络失败：保留页面，提供 Retry。
- 重复触发：得到同一结果或明确的已完成响应。

### 4.10 结果页

**免费视图**：有价值的健康摘要、免责声明、被锁定内容的类别说明、模拟解锁 CTA。  
**完整视图**：完整指标、建议摄入、目标日期、预测曲线和解释。  
**支付后**：重新请求服务端结果，不仅在前端解除遮罩。  
**重新测评**：创建新 Assessment，不修改已完成记录。

支付异常按错误码处理：

| 错误 | 页面行为 |
|---|---|
| `SESSION_REQUIRED` | 说明会话已失效；当前结果不可继续解锁，确认后回入口创建新 Session |
| `ASSESSMENT_NOT_COMPLETED` | 拉取 Session 状态并跳回 `nextStep`，不继续支付 |
| `IDEMPOTENCY_KEY_REUSED` | 生成新幂等键后仅在用户再次点击时重试，不自动重付 |
| `FORBIDDEN_ORIGIN` | 提示刷新官方页面；不自动重试 |
| `RATE_LIMITED` | 保留免费结果，按 `Retry-After` 后恢复 CTA |
| 网络失败/5xx | 保留免费结果与原幂等键，显示“支付状态未知，可安全重试”；用户点击重试时复用原键 |

免费摘要的 `summary` 使用固定中性文案映射，不做诊断：`UNDERWEIGHT` → “Your estimated BMI is below the general reference range.”；`NORMAL` → “Your estimated BMI is within the general reference range.”；`OVERWEIGHT` → “Your estimated BMI is above the general reference range.”；`OBESITY` → “Your estimated BMI is well above the general reference range.”。四种文案后均紧邻免责声明，不使用“健康/不健康”结论。

入口状态的确定行为：

| 服务端/本地状态 | 默认页面 | 可用操作 |
|---|---|---|
| 无 Cookie、无 `hasSeenSession` | 欢迎页 | 开始新测评 |
| 无效/过期 Cookie，或无 Cookie 但有 `hasSeenSession` | 会话丢失提示 | 确认后创建新 Session |
| 有 `IN_PROGRESS` | 第一处缺失/失效步骤 | 继续测评 |
| 无进行中、存在 `COMPLETED` | 最近完成结果页 | 查看结果、明确创建新测评 |
| 已在结果页且结果属于当前 Session | 免费或完整结果 | Demo Unlock（仅 FREE）、重新测评 |

直接访问路由时必须先做服务端状态守卫：未完成用户访问 `/result` 跳到 `nextStep`；已完成用户访问问卷路由跳到结果；URL 中的步骤晚于 `nextStep` 时跳回 `nextStep`，早于或等于 `nextStep` 时允许查看/修改；无有效 Session 时进入上述首次/丢失分支。

## 5. 全局交互状态

| 状态 | 产品行为 |
|---|---|
| 初始加载 | 显示骨架屏；等待 Session/Assessment 恢复结果 |
| 保存中 | 禁用当前主操作，避免重复导航 |
| 保存成功 | 更新进度并前进 |
| 400 校验失败 | 留在当前页，在字段附近显示可行动错误 |
| 409 版本冲突 | 拉取服务端最新状态，提示用户重新确认当前答案 |
| 401/无效 Session | 创建新 Session 前先提示无法恢复旧进度 |
| 403 Origin/CSRF 失败 | 不重试写入；提示刷新官方页面后再试，不引导关闭安全设置 |
| 404 Assessment 不存在 | 回入口，提供开始新测评 |
| 5xx/网络失败 | 保留输入，显示重试；不可乐观前进 |
| Session Cookie 过期/丢失 | 说明旧进度无法恢复，确认后创建新 Session |
| 413 请求体过大 | 拒绝请求并提示刷新后重试；前端不得发送无关字段 |
| 422 前置步骤缺失 | 跳到服务端返回的首个前置步骤，保留当前尚未保存的可见输入 |
| 429 请求过多 | 保留当前页面与输入，按 `Retry-After` 倒计时后允许重试 |

## 6. 进度、返回和恢复

- 问卷显示 `当前步骤 / 8` 与进度条。
- 返回上一步允许修改 `IN_PROGRESS` 的答案。
- 修改早期答案后，服务端立即重新校验受影响的下游答案；合法答案保留，非法答案被置空并返回 `invalidatedSteps`。
- 依赖失效规则：修改 `ageRange` 时重新校验 `age`；修改 `goal`、`heightCm` 或 `weightKg` 时重新校验 `targetWeightKg`。
- 当前步骤与进度以第一处“缺失或失效”的必填步骤为准；不能把字段非空等同于有效。
- `COMPLETED` Assessment 不允许编辑；重新测评创建新记录。
- 恢复时以服务端返回的“第一处未完成必填步骤”为准，不盲信前端 URL。
- 多标签页发生 409 时，前端拉取服务端最新答案并让用户确认，不自动覆盖。
- 若重放答案与服务端当前规范化值一致，服务端返回 200；前端直接采用返回的当前版本，无需冲突弹窗。

## 7. 信任、隐私与免责声明文案

入口需提供条款和隐私说明入口。结果页至少展示：

> This assessment is a general wellness estimate for demonstration purposes. It is not medical advice, diagnosis, or a substitute for professional care.

避免使用“保证减重”“医学认证”“绝对准确”等未经支持的表述。

## 8. 页面级验收清单

- 所有选项与输入可用键盘完成。
- 所有字段都有可见 label 与服务端错误反馈。
- loading 时不会重复发起写请求或重复跳转。
- 刷新每个步骤都能恢复正确答案和进度。
- 切换单位不会造成可见值与保存值不一致。
- 手机宽度下无横向滚动，主 CTA 可见。
- 免费结果的锁定内容不能从页面源数据或 API 响应获取。
