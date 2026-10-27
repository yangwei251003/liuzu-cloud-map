# 017 计数约束回归

这是独立、可选的开发验证目录。使用精确锁定的 PGlite 0.5.12（Apache-2.0）在内存 PostgreSQL 中执行原 013 建表、原 016 计数升级与 017 修复；没有数据库账户、监听端口或真实服务连接，初始化后禁止 fetch。依赖通过 npm 获取，不打包依赖缓存。

从仓库根运行，需 Node 24：

```sh
npm ci --prefix tests/migration017 --ignore-scripts
node tests/migration017/test-migration017.mjs
```

20 项实际检查包括：原多列 CHECK 自动命名导致的拒绝、仅删除旧谓词、保留自定义规则、观测或事件单独作为有效来源、负数/空来源/边数越界拒绝、存在六类证据时拒绝回滚、017 回滚与原 016 升降级无重名冲突，以及歧义/未知规则/未验证约束拒绝。数据库均为合成内存表，外键目标与证据表只保留此次验证所需结构。

这不是完整 PostGIS 16、空间查询、真实路况或全业务验收；完整验证仍由既有 Web release gate 在一次性 PostGIS 容器执行。旧 001–016 的 32 份迁移/回滚文件保持原校验值。017 回滚有意只允许无相关证据的库，不删除数据来使旧规则成立。

[PGlite 官方文档](https://pglite.dev/docs/) · [本次实际结果](../../docs/migration017-regression.json)
