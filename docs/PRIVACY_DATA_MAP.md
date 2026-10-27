# 隐私数据地图

下表是 P0 的目标数据边界与已编码控制，不是对真实数据库、浏览器缓存、CDN 日志或供应商删除能力的完成证明。

| 数据 | 目标位置/用途 | 已编码的边界 | 仍待证明 |
| --- | --- | --- | --- |
| 浏览器定位 | 端侧前台导航 | 不将连续精确轨迹写入 P0 会话事件；`../database/migrations/003_p0_control_plane.sql` 明确禁止轨迹/坐标写入会话事件。 | 真机权限撤回、后台/锁屏、浏览器存储清理和日志审计。 |
| 本机草案 | 浏览/未登录草拟 | 本地数据应可由用户清理，不应跨设备自动同步。 | 最终浏览器 E2E 与可访问性/文案验收。 |
| 账号、会话、导出和删除 | 登录、跨设备保存 | `../src/app/api/v1/me/export/route.ts`、`../src/app/api/v1/me/route.ts`、`../src/lib/server/visitor-data-rights-service.ts` 提供最小导出、同意和事务化删除边界。 | 真数据库事务、保留期、DSAR SLA、供应商删除和身份验证。 |
| 私密分享 | 七天、可撤销的最小字段只读分享 | `../src/app/api/v1/shared-routes/resolve/route.ts` 与 `../src/lib/server/share-link-resolve.ts` 仅通过 fragment 后的 POST body 解析 token；`../public/sw.js` 对 `/share` 和 API 使用 network-only/no-store。 | 真环境 Referer、访问日志、缓存键、撤销/过期和跨设备验证。 |
| 同意、审计和运维日志 | 合规证明与安全排障 | 同意记录与最小审计结构已建模；`../src/lib/server/observability.ts` 提供敏感字段脱敏接口。 | 实际接收器、保留期限、访问控制、告警与审计保全。 |

## 数据主体功能

目标功能包括：查看/变更同意、导出最小账号数据、撤销全部会话、在验证当前口令后删除账号及关联分享。浏览器本机清理不能替代服务端删除，界面必须如实说明差异。相关源码级测试位于 `../tests/visitor-data-rights-http.test.mjs`、`../tests/visitor-data-rights-service.test.mjs` 和分享测试中；当前自动化取证版本与数字统一以 [RELEASE_READINESS_AUDIT.md](RELEASE_READINESS_AUDIT.md) 为准，但不替代真环境缓存、日志与删除履约证据。

## 禁止用途

不保存连续精确轨迹；不共享实时位置；不以轨迹做个性化；不以交互或定位训练模型；公开 UGC 在 P0 保持关闭。任何例外都需要新的产品、隐私、法律和数据处理审核，不能由现有代码自动授权。

生产数据库、身份提供方、日志/缓存供应商、隐私政策、用户协议、SDK 清单、未成年人和投诉机制尚未取得证据，因而本领域总体为 `PARTIAL`，并维持 **NO-GO**。
