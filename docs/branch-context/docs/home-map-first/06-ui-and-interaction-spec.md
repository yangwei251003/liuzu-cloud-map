# 视觉与交互详细规范 (06-ui-and-interaction-spec.md)

## 1. 设计 Token 与色彩系统

| Token 名称 | 颜色值 (HEX/RGBA) | 使用场景 |
| :--- | :--- | :--- |
| `--color-forest-primary` | `#173f35` | 主品牌森林绿，用于主要按钮、导航标题、焦点状态 |
| `--color-forest-surface` | `#173f35 / 88%` | 地图悬浮状态面板背景（支持毛玻璃 blur 12px） |
| `--color-amber-accent` | `#b88a43` | 禅金点缀色，用于强调高亮、主要 CTA、选中态描边 |
| `--color-bg-rice-paper` | `#fbf8f2` | 宣纸米白背景，页面主底色，柔和不刺眼 |
| `--color-card-surface` | `rgba(255, 255, 255, 0.85)` | 悬浮卡片背景，带 `backdrop-blur-md` |
| `--color-border-subtle` | `rgba(23, 63, 53, 0.12)` | 统一轻质感描边 |
| `--color-danger` | `#8d493e` | 警告与错误提示色 |

---

## 2. 层级与 Z-Index 规范

- `z-0`：地图底图渲染 Canvas (`AmapDetailedMap` / `MapLibreCanvas`)
- `z-10`：地图标记 Marker、路线轨迹 Polyline
- `z-20`：地图角落供应商合规审图号信息 (Attribution)
- `z-30`：地图右上角图层控制、右下角缩放/定位控件
- `z-40`：顶部浮动搜索与能力胶囊、选中点位行动卡 (Selected Spot Card)
- `z-50`：全局导航栏 (Header)
- `z-60`：全屏模态对话框 (Modal/Dialog/Drawer)

---

## 3. 微交互与动效规范

1. **地图相机飞移 (FlyTo / PanTo)**：
   - 当用户从点位列表或搜索建议中选择地点时，地图以 600ms 平滑缓动飞移至目标坐标；
   - 尊重 `prefers-reduced-motion`：若开启无障碍减弱动效，直接切换中心点不播放动画。
2. **点位悬停与选中态**：
   - 悬停：Marker 微放大 1.08x 并带微光；
   - 选中：Marker 外圈呈现 `#b88a43` 禅金色呼吸光环，同时点位详情卡以 300ms Spring 动效自底部滑出。
3. **图层选择器切换**：
   - 默认显示为小巧图标药丸按钮，点击展开下拉毛玻璃面板；
   - 切换地图皮肤时不产生白屏闪烁，平滑过渡。
4. **表单微交互**：
   - 聚焦高亮：输入框获得焦点时边框变为 `--color-amber-accent`，伴随 2px 外发光；
   - 密码显隐：点击眼睛图标瞬间切换 `type="text"` 与 `type="password"`，并带有无障碍 `aria-label` 状态更新。
