# P0-04 八步 Funnel、单位切换与路由恢复

**标签**：`priority:P0` `type:feature` `area:frontend`
**估算**：6h
**依赖**：P0-02、P0-03

## 需求

实现八步问卷 UI、返回修改、保存中/失败/冲突状态、单位切换、刷新恢复和服务端路由守卫。

**PRD 条款**：[主 PRD §5](../../prd/01-master-prd.md#5-端到端用户旅程)、[Funnel §4–§8](../../prd/02-funnel-and-screen-spec.md#4-页面详细需求)、[主 PRD §7 可访问性/兼容性](../../prd/01-master-prd.md#7-非功能要求)。

## API

- 页面进入先消费 `GET /api/session`，创建用 API-01，保存用 API-03，新测评用 API-07。
- 保存成功才导航；失败保留用户输入并提供原请求重试；409 时刷新服务端状态后提示冲突。
- 直接访问路由时以服务端 `status/nextStep` 守卫：过晚步骤退回 nextStep，已完成问卷跳结果，未完成访问结果退回问卷。

## 数据约束

- 浏览器不得存 token、Assessment 答案或 Result；仅可保存 `hasSeenSession=true`。
- UI 可保留本次未提交输入，但恢复后服务端数据为真相来源。
- 公英制切换不得改变规范化领域值；提交只发公制。
- loading 防重复写；免费锁定区不得预载保护数据。

## 测试

- [ ] `P0-04-T01` 新访客完成八步并到达免费结果。来源：[质量计划 §3.5(1)](../../prd/07-quality-and-acceptance-plan.md#35-浏览器-e2e)。
- [ ] `P0-04-T02` 中途刷新恢复答案和正确步骤。来源：[质量计划 §3.5(2)](../../prd/07-quality-and-acceptance-plan.md#35-浏览器-e2e)。
- [ ] `P0-04-T03` 非法目标体重阻止前进并显示字段错误；保存故障保留输入，可重试。来源：[Funnel §5](../../prd/02-funnel-and-screen-spec.md#5-全局交互状态)。
- [ ] `P0-04-T04` 首次访问不误报丢失；仅有历史标记但无有效 Cookie 时显示丢失提示。来源：[质量计划 §3.5(5–6)](../../prd/07-quality-and-acceptance-plan.md#35-浏览器-e2e)。
- [ ] `P0-04-T05` 过早/过晚步骤和结果路由均按服务端状态跳转。来源：[质量计划 §3.5(7)](../../prd/07-quality-and-acceptance-plan.md#35-浏览器-e2e)。
- [ ] `P0-04-T06` 键盘操作、可见 label、读屏错误、移动端无横滚、CTA 可见。来源：[Funnel §8](../../prd/02-funnel-and-screen-spec.md#8-页面级验收清单)。
- [ ] `P0-04-T07` 公英制往返切换后显示值与提交公制值一致。来源：同上。

## 完成定义

- [ ] Chrome/Safari 桌面与移动基础流程人工 smoke 通过。
- [ ] Playwright 覆盖 T01–T05；可访问性和响应式检查有记录。
