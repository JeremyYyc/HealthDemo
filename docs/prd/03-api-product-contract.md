# API 产品契约

> 版本：v1.0 MVP Frozen  
> 本文定义可观察行为；最终字段命名以 OpenAPI/实现为准，但不得改变产品语义。

## 1. 设计原则

- REST 风格、名词化资源、HTTP 方法语义一致。
- Session 身份由安全 Cookie 推导，不接受客户端任意指定 userId。
- 所有输入先经 Zod/等价校验，再进入业务层。
- 正常与错误响应结构稳定，便于前端和自动化测试消费。
- 写接口对重复调用有确定行为；并发修改可检测。
- 结果权限由服务端 DTO 白名单控制。
- 所有写接口必须验证同源 `Origin`；请求体上限为 16KB，仅接受 `application/json`。
- 所有会话资源在鉴权后按当前 Session 查询；不存在与不属于当前 Session 统一返回 404，禁止可枚举性差异。

## 2. MVP 冻结接口清单

| ID | Method | Path | 作用 | 优先级 |
|---|---|---|---|---|
| API-01 | POST | `/api/sessions` | 创建匿名 Session 和 Assessment | P0 |
| API-02 | GET | `/api/session` | 恢复当前 Session、Assessment 和进度 | P0 |
| API-03 | PATCH | `/api/assessments/:id/steps/:step` | 保存某一步增量答案 | P0 |
| API-04 | POST | `/api/assessments/:id/complete` | 整体验证、计算并持久化结果 | P0 |
| API-05 | GET | `/api/assessments/:id/result` | 返回免费或完整结果 | P0 |
| API-06 | POST | `/api/pay` | 模拟支付并激活订阅 | P0 |
| API-07 | POST | `/api/assessments` | 为当前 Session 创建新测评 | P0 |
| API-08 | GET | `/api/health` | 部署健康检查 | P0（交付） |
| API-09 | POST | `/api/demo/session-exchange` | 用受控 review code 换取已付费演示 Session Cookie | P0（交付） |

MVP 使用下表路径，不再保留统一 `PATCH /api/assessment` 备选方案。实现如需改名必须按需求变更流程同步前端、OpenAPI、README cURL 和测试。

## 3. 通用响应

### 3.1 成功

```json
{
  "data": {},
  "meta": {
    "requestId": "req_xxx"
  }
}
```

### 3.2 错误

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data.",
    "details": [
      { "field": "heightCm", "reason": "Must be between 100 and 250." }
    ],
    "requestId": "req_xxx"
  }
}
```

`details` 不包含堆栈、SQL、token 或内部实现信息。

## 4. Session 与恢复

### POST `/api/sessions`

**行为**：创建随机不透明 token，在服务端只保存其安全摘要；通过有效期 30 天的 HttpOnly Cookie 下发。生产环境 Cookie 使用 `Secure; SameSite=Lax; Path=/`。新建时在同一事务创建 `IN_PROGRESS` Assessment、`INACTIVE` Subscription 并保存入口年龄分组。

请求示例：

```json
{ "ageRange": "18_29" }
```

返回：Session 公共 ID、Assessment ID、状态、当前/下一步、版本号。确定语义如下：

- 无有效 Cookie：`201 Created`，创建 Session 与 `IN_PROGRESS` Assessment。
- 有有效 Cookie且存在进行中测评：`200 OK`，返回原测评，不创建新记录；忽略本请求的 `ageRange`，避免入口点击覆盖已保存进度。
- 有有效 Cookie 但只有已完成测评：`200 OK`，返回最近完成测评及 `VIEW_RESULT`、`START_NEW` 动作；创建新测评必须显式调用 `POST /api/assessments`。

客户端必须先调用 `GET /api/session` 再决定是否展示年龄分组。Session 采用固定 30 天绝对有效期，访问不延长 `expiresAt` 或 Cookie Max-Age。无 Cookie 返回 401；无效、篡改或已过期 Cookie 也返回 401，并清除该 Cookie。服务端不根据本地 `hasSeenSession` 标记鉴权。

### GET `/api/session`

返回当前匿名用户的订阅摘要，以及最近的进行中测评；若无进行中测评，按 `completedAt DESC, id DESC` 确定性返回最近完成测评与可用动作。

```json
{
  "data": {
    "sessionId": "ses_public_xxx",
    "subscriptionStatus": "INACTIVE",
    "assessment": {
      "id": "asm_xxx",
      "status": "IN_PROGRESS",
      "currentStep": "HEIGHT",
      "completedSteps": ["AGE_RANGE", "SEX", "GOAL", "AGE"],
      "answers": { "ageRange": "18_29", "sex": "FEMALE", "goal": "LOSE_WEIGHT", "age": 25 },
      "version": 4
    }
  }
}
```

### POST `/api/assessments`

请求体固定为空对象 `{}`。仅在当前 Session 没有进行中测评时创建新 `IN_PROGRESS` Assessment，返回 `201 Created` 和 `created: true`。若已有进行中测评，返回 `200 OK` 和现有记录（`created: false`）；不得创建第二条。该规则由数据库部分唯一约束兜底。若当前 Session 尚无有效 Session，返回 401。

## 5. 分步保存

### PATCH `/api/assessments/:id/steps/:step`

冻结步骤键：`age-range`、`sex`、`goal`、`age`、`height`、`current-weight`、`target-weight`、`activity`。

请求需携带当前 `version`，例如：

```json
{ "heightCm": 172.5, "version": 3 }
```

成功后：

```json
{
  "data": {
    "assessmentId": "asm_xxx",
    "savedStep": "HEIGHT",
    "completedSteps": ["AGE_RANGE", "SEX", "GOAL", "AGE", "HEIGHT"],
    "nextStep": "CURRENT_WEIGHT",
    "invalidatedSteps": [],
    "version": 4
  }
}
```

行为要求：

- Session 必须拥有该 Assessment，否则返回 404（避免泄露资源存在性）。
- `COMPLETED` 状态返回 409 `ASSESSMENT_LOCKED`。
- 除下一条定义的同值幂等重放外，版本不匹配返回 409 `VERSION_CONFLICT`，不得静默覆盖。
- 幂等判断先于版本冲突：规范化后的提交值与当前数据库值相同，且不会产生新的下游失效时，即使请求版本已旧也返回 200、当前版本和 `replayed: true`，不递增版本；否则版本不匹配返回 409。
- 允许乱序保存不依赖前置答案的已知步骤，但 `nextStep` 始终指向第一处缺失或失效的必填项。`age` 缺少 `ageRange`，或 `target-weight` 缺少 `goal`、`heightCm`、`weightKg` 时返回 422 `STEP_PREREQUISITE_MISSING`、列出所缺步骤且不落库。
- 保存上游答案后立即重新校验依赖字段：`ageRange → age`，`goal/height/currentWeight → targetWeight`。失效字段在同一事务置空并通过 `invalidatedSteps` 返回。
- 数值最多一位小数按数学值校验，例如 `value × 10` 必须为整数（允许实现所需的浮点误差）；API 不依据 JSON 原始文本的小数位数判断。

## 6. 完成测评

### POST `/api/assessments/:id/complete`

请求必须携带客户端最后确认的版本：

```json
{ "version": 8 }
```

在一个数据库事务中：

1. 确认归属、`IN_PROGRESS` 状态和版本一致。
2. 校验所有必填字段和跨字段规则。
3. 计算结果快照。
4. 创建唯一 AssessmentResult。
5. 通过 `id + sessionId + version + IN_PROGRESS` 条件原子标记 Assessment 为 `COMPLETED` 并递增版本、写入完成时间。

缺失或失效字段返回 422 `ASSESSMENT_INCOMPLETE` 和按问卷顺序排列的 `requiredSteps`；版本冲突返回 409。相同版本的并发 complete 只允许一个请求创建结果，另一个在锁等待/唯一约束冲突后读取并返回已存在结果，不生成第二份记录。

完成成功统一返回 200，响应仅含 `{ assessmentId, status: "COMPLETED", completedAt, resultUrl, version, replayed }`，不内嵌结果字段。对当前 Session 已完成 Assessment 再次调用时忽略请求中的旧版本，返回相同完成元数据和 `replayed: true`；因此网络超时可安全重试，且不会绕过结果接口的 Free/Full 权限裁剪。

## 7. 获取结果

### GET `/api/assessments/:id/result`

- Assessment 未完成：409 `ASSESSMENT_NOT_COMPLETED`。
- 无权限访问：404。
- 订阅无效：返回 `accessLevel: "FREE"` 和免费 DTO。
- 订阅有效：返回 `accessLevel: "FULL"` 和完整 DTO。
- Assessment 已完成但 Result 缺失属于数据不变量破坏，返回 500 `INTERNAL_ERROR` 并记录 requestId，不临时重算或返回空结果。

不得返回完整对象后让前端删除字段。两类响应必须由独立白名单 DTO 构造，详见订阅专项文档。

## 8. 模拟支付

### POST `/api/pay`

请求示例：

```json
{
  "assessmentId": "asm_xxx",
  "idempotencyKey": "demo_01H..."
}
```

浏览器请求不携带服务端 secret。接口根据当前 HttpOnly Session 验证 Assessment 归属，通过同源 `Origin` 校验、共享限流和幂等键控制滥用与重放。返回 Payment ID、Subscription 状态和生效时间。

- 幂等键为 8–128 字符的客户端随机字符串，唯一范围是 `(sessionId, idempotencyKey)`。先查询该 Session 已持久化的 Payment：相同键且请求指纹（本 MVP 为 `assessmentId`）相同则返回第一次结果；相同键但请求指纹不同则 409 `IDEMPOTENCY_KEY_REUSED`。
- 其他 Session 使用相同文本键是独立请求，绝不返回原 Session 的 Payment ID 或状态。
- 已经 `ACTIVE` 后使用新幂等键：返回当前 Subscription，`paymentCreated: false`，不创建第二条成功 Payment。
- 两个不同幂等键并发首次支付：事务串行化同一 Subscription，只允许一个创建首次成功 Payment，另一个读取已激活状态。
- Assessment 必须属于当前 Session 且为 `COMPLETED`；未完成返回 409 `ASSESSMENT_NOT_COMPLETED`。

首次激活或原键重放返回 `{ paymentId, paymentCreated, subscriptionStatus: "ACTIVE", activatedAt }`。已 ACTIVE 后的新键不创建也不预留 Payment/幂等记录，返回现有 `activationPaymentId` 作为 `paymentId` 与 `paymentCreated: false`；因此后续任意新键仍是同一无副作用的 ACTIVE no-op。只有已实际持久化的激活 Payment 键参与请求指纹冲突判断。

Demo provider 没有外部异步过程：P0 成功路径直接在同一事务创建 `SUCCEEDED` Payment 并激活 Subscription。事务前的校验/限流失败不创建 Payment；事务内部失败整体回滚并返回 500，允许用同一键重试。`PENDING`/`FAILED` 仅为未来真实支付预留，MVP 不写入这两种状态，避免出现无法解释的半成品审计记录。

### POST `/api/demo/session-exchange`

仅用于面试交付。评审者只提交 `{ "reviewCode": "..." }`；请求不接受 Session/Assessment ID。服务端验证其摘要后，为预置已付费 Session 下发 HttpOnly Cookie。响应不返回真实 token，也不把 token 放入 URL。错误 code 统一返回 401 `INVALID_REVIEW_CODE`；功能关闭、配置缺失或固定演示 Session 不可用时统一返回 503 `DEMO_EXCHANGE_UNAVAILABLE`；两者都不透露固定 Session 信息。review code 可轮换，生产化版本必须删除或关闭此接口。

### GET `/api/health`

数据库可连接且应用完成初始化时返回 200：`{ "data": { "status": "ok", "database": "reachable", "appVersion": "..." } }`。数据库不可达或必要初始化失败时返回 503 `SERVICE_UNAVAILABLE`。响应不得包含连接串、供应商密钥、迁移详情、表数量或内部错误；健康检查不写数据库、不创建 Session。

### 同源与限流统一规则

- 所有 POST/PATCH 写接口要求 `Origin` 精确匹配服务端配置的 `APP_BASE_URL` origin；缺失或不匹配均返回 403 `FORBIDDEN_ORIGIN`。README 的 cURL 必须显式带该请求头。
- P0 共享限流使用数据库持久化计数或部署平台提供的跨实例存储，禁止仅用 Serverless 进程内 Map。
- `/api/pay`：每 Session 每 60 秒最多 10 次；`session-exchange`：每来源 IP 每 15 分钟最多 5 次。超限返回 429 和整数秒 `Retry-After`。来源 IP 仅用于限流，日志中保存不可逆摘要，不保存完整 IP。
- 其他写接口的基础防滥用可在不改变产品语义的前提下实施；不得让限流失败影响已提交事务。

## 9. 状态码与错误码

| HTTP | 错误码 | 场景 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | JSON/字段格式或范围非法 |
| 401 | `SESSION_REQUIRED` | 缺少或无效 Session |
| 401 | `INVALID_REVIEW_CODE` | Demo exchange 凭证错误 |
| 403 | `FORBIDDEN_ORIGIN` | 写请求 Origin 缺失或不匹配 |
| 404 | `RESOURCE_NOT_FOUND` | 不存在或不属于当前 Session |
| 409 | `VERSION_CONFLICT` | 并发写版本冲突 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 同 Session 同幂等键对应不同请求指纹 |
| 409 | `ASSESSMENT_LOCKED` | 修改已完成测评 |
| 409 | `ASSESSMENT_NOT_COMPLETED` | 提前访问结果 |
| 422 | `ASSESSMENT_INCOMPLETE` | 完成时缺字段或跨字段不一致 |
| 422 | `STEP_PREREQUISITE_MISSING` | 乱序保存时缺少该步骤的前置答案 |
| 422 | `BUSINESS_RULE_VIOLATION` | 单步值格式合法但违反年龄分组、目标方向、目标 BMI 或预测周期规则 |
| 429 | `RATE_LIMITED` | 超过共享限流；支付与 demo exchange 为 P0 防护 |
| 413 | `PAYLOAD_TOO_LARGE` | 请求体超过 16KB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 非 `application/json` 的写请求 |
| 500 | `INTERNAL_ERROR` | 未预期服务端错误 |
| 503 | `DEMO_EXCHANGE_UNAVAILABLE` | Demo exchange 已关闭、未配置或固定 Session 不可用 |
| 503 | `SERVICE_UNAVAILABLE` | 健康检查所需依赖不可用 |

## 10. API 验收

- 每个写接口都有正常、非法、未授权、重复和适用的并发用例。
- 错误结构稳定且不泄露内部信息。
- 非会员结果响应中保护字段在序列化层面不存在。
- cURL 能从 Session 创建一直走到支付后完整结果。
- 同值旧版本重放、异值旧版本冲突、complete 超时重试、跨 Session 同文本幂等键均有契约测试。
- API 文档和实际实现由测试或 OpenAPI 校验保持一致。
