# AI 安全与知识政策

## 当前实现边界

- Gemini 仅保留为开发适配器。`../src/lib/ai-guide/gemini.server.ts` 要求远程启用、质量门、数据处理批准和持久限流门全部具备；缺一项即保持关闭。该代码开关不是供应商合同、合规批准或生产启用证据。
- 问答与游记解析分别受限：`../src/lib/ai-guide/service.server.ts` 的回答应输出带来源的声明；`../src/app/api/v1/itinerary-extractions/route.ts` 只接收自然语言提取结果，POI 匹配、开放冲突、可达性和路线由确定性服务决定。
- 输出使用严格 JSON Schema；来源 ID、事实类型和每句可见引用由适配器校验。无引用事实、动态运营猜测、危险建议、提示注入和未知内容应被拒绝或转人工。
- 版本化知识、内容生命周期和撤回数据表已在 `../database/migrations/003_p0_control_plane.sql` 预留；当前没有可宣称为已审核生产知识库的内容。

## 知识生命周期

`DRAFT → IN_REVIEW → APPROVED → PUBLISHED → WITHDRAWN`。仅已审核、已发布、未撤回且未过期的条目才可参与发布问答；撤回需要使缓存、回答版本和讲解失效。没有来源、审核人、权利状态、有效期和回滚依据的条目不得进入受控公开测试的事实回答。

## 输入、输出与日志

API 应采用有界 JSON、同源校验、身份/权限、幂等、超时、持久限流、结构化错误和请求 ID。日志不得保留完整问题、正文、口令、token、精确位置或轨迹；`../src/lib/server/observability.ts` 仅提供脱敏观测接口，不构成真实接收器或日志保留证据。

## 证据状态

相关源码测试包括 `../tests/ai-guide.test.mjs` 与 `../tests/ai-quality-golden-set.test.mjs`；当前自动化取证版本与数字统一以 [RELEASE_READINESS_AUDIT.md](RELEASE_READINESS_AUDIT.md) 为准。更重要的是，审核知识、宗教/文化内容审批、模型供应商合同/数据处理、质量验收和生产持久限流仍是外部 `LEGAL/COMPLIANCE BLOCKER`。因此远程模型必须继续默认关闭，AI 不得被表述为实时景区事实服务。
