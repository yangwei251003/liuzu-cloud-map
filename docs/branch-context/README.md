# 云游地图 (Liuzu Cloud Map) · 三端协同文旅数字平台

[![Next.js](https://img.shields.io/badge/Next.js-16.3.0-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![AMap](https://img.shields.io/badge/AMap-JSAPI%20v2.0-green)](https://lbs.amap.com/)

> “云游地图”是以六祖镇文旅为示范标杆的**空间文旅地图与多角色生态协同平台**。
> 本仓库已完全实现 **游客端 (云游地图) + 创作与管理端 (云游 Studio) + 商家入驻端 (云游伙伴中心)** 的全流程闭环与跨端协同。

---

## 🌟 核心终端架构

1. 🍵 **商户伙伴中心 (`/partner/*`)**：支持合作社、本地商家快速入驻，4 步申报特色文旅活动与茶园基地，全生命周期追踪审核进度与转化看板。
2. 🖥️ **云游 Studio 运营中枢 (`/studio/*`)**：运营人员双栏内容审核、高德地图经纬度微调落图、全域文旅资源与活动台账、首页与地图推荐位精选编排。
3. 🗺️ **游客端地图与发现 (`/explore`, `/map`, `/place/*`, `/activity/*`, `/trip`)**：游客瀑布流发现当季体验、高德地图全景联动、深度图文详情、个人轻行程收藏与一键出发导航。
4. 🎛️ **评委演示控制中枢 (`/judge`)**：一键切换三端角色、全景数据看板、一键重置初始演示数据。

---

## 🚀 快速启动

```bash
# 1. 进入 Web 工程
cd web

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local

# 4. 启动本地开发服务
npm run dev

# 5. 访问评委演示中枢
# http://localhost:3000/judge
```

---

## 📚 详细文档索引

- 📖 **[开发者接手与二次开发交接指南 (DEVELOPER_HANDOVER_GUIDE.md)](./DEVELOPER_HANDOVER_GUIDE.md)**：包含详细架构图、数据流、状态机、权限矩阵及真实后端接入指引。
- 🏆 **[评委现场演示与黄金路径指南 (README_JUDGE_MVP.md)](./README_JUDGE_MVP.md)**：包含 5 步黄金路径演示说明与三端协同操作步骤。
- 📑 **[项目调研与设计全套 PRD 文档 (docs/judge-mvp/)](./docs/judge-mvp/)**：包含 15 份深度调研、架构与设计系统 Markdown 文档。
