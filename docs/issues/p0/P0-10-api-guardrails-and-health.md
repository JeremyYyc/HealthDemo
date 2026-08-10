# P0-10 通用 API 防护、错误契约与健康检查

**标签**：`priority:P0` `type:feature` `area:api` `risk:security`
**估算**：4h
**依赖**：P0-01

## 需求

实现所有接口共用的成功/错误封装、requestId、鉴权资源隔离、写请求防护、共享限流能力和只读健康检查。

**PRD 条款**：[主 PRD §4.1(13)、§7](../../prd/01-master-prd.md#41-p0--must)、[API §1、§3、§8–§10](../../prd/03-api-product-contract.md#1-设计原则)、[部署规格 §3、§5](../../prd/08-deployment-and-delivery-spec.md#3-线上要求)。

## API

- 成功 `{data,meta:{requestId}}`；错误 `{error:{code,message,details,requestId}}`。
- 所有 POST/PATCH 仅接受 `application/json`、最大 16KB、Origin 精确匹配 `APP_BASE_URL` 的 `scheme+host+port`。
- 会话资源不存在或不归属统一 404；错误详情不含栈、SQL、token 或内部信息。
- `GET /api/health`：应用和数据库可用 200；依赖失败 503；不得写库或创建 Session。
- 限流状态必须跨 Serverless 实例共享；支付和 exchange 采用各自冻结窗口。

## 数据约束

- requestId 在路由、日志、错误响应中一致，但不携带敏感健康数据。
- 限流记录只保存必要键/不可逆 IP 摘要与过期计数。
- Prisma Client 全局复用；健康检查不暴露连接串、迁移详情、表数量或供应商密钥。

## 测试

- [ ] `P0-10-T01` 错误 Content-Type、空/畸形 JSON、>16KB、Origin 缺失/错误分别返回 415/400/413/403。来源：[质量计划 §7](../../prd/07-quality-and-acceptance-plan.md#7-测试数据与隔离)。
- [ ] `P0-10-T02` 无效/过期 Cookie 与跨 Session 资源不会暴露存在性。来源：[API §1、§9](../../prd/03-api-product-contract.md#1-设计原则)。
- [ ] `P0-10-T03` 所有冻结错误码结构稳定，无内部信息。来源：[API §9–§10](../../prd/03-api-product-contract.md#9-状态码与错误码)。
- [ ] `P0-10-T04` 共享限流达到阈值后 429 带整数 `Retry-After`，跨实例状态一致。来源：[API §8](../../prd/03-api-product-contract.md#同源与限流统一规则)。
- [ ] `P0-10-T05` 健康检查正常 200；数据库不可达 503；两者均不写库、不泄密。来源：[API §8](../../prd/03-api-product-contract.md#get-apihealth)。

## 完成定义

- [ ] 公共防护被所有写路由复用，并有路由级契约测试防止漏挂。
- [ ] README cURL 全部显式带 Content-Type 与合法 Origin。
