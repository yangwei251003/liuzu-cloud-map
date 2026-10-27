# 跨端协同旅程与状态流转设计

## 1. 跨端角色时序图 (Mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor Merchant as 商户 (云游伙伴中心)
    actor Operator as 运营管理 (云游 Studio)
    actor Visitor as 游客 (云游地图)
    participant Repo as 共享数据仓库 (IndexedDB/Repository)

    %% 阶段 1: 商户提交
    Merchant->>Merchant: 1. 进入资源/活动发布向导
    Merchant->>Merchant: 2. 地图打点拾取经纬度，上传活动图文
    Merchant->>Repo: 3. 提交审核 (状态: PENDING_REVIEW)
    Repo-->>Operator: 待办审核队列实时出现新条目

    %% 阶段 2: 平台审核与落图
    Operator->>Repo: 4. 打开审核详情，查看商户提交资料
    Operator->>Operator: 5. 在地图编辑器中校准坐标与标签
    Operator->>Repo: 6. 审核通过并发布 (状态: PUBLISHED, featured=true)
    Repo-->>Visitor: 已发布资源进入公开查询集合

    %% 阶段 3: 游客发现与互动
    Visitor->>Repo: 7. 访问地图/发现页，读取已发布资源
    Visitor->>Visitor: 8. 地图点击标记查看卡片与详情
    Visitor->>Repo: 9. 触发查看事件 (Event: VIEW)
    Visitor->>Repo: 10. 点击收藏 (Event: FAVORITE)
    Visitor->>Visitor: 11. 发起高德路线规划与导航
    Visitor->>Repo: 12. 触发导航事件 (Event: NAVIGATION_START)

    %% 阶段 4: 数据回流
    Repo-->>Merchant: 伙伴中心工作台更新访问量与导航次数
    Repo-->>Operator: Studio 仪表盘更新平台活跃度统计
```

---

## 2. 核心状态机流转规则

```text
       [草稿 DRAFT]
            │
            ▼ (提交审核)
   [待审核 PENDING_REVIEW]
      │                 │
      │ (要求修改)      │ (审核通过)
      ▼                 ▼
[需修改 CHANGES_REQ] [已通过 APPROVED]
      │                 │
      ▼ (重新提交)      ▼ (发布上线)
   [待审核]       [已发布 PUBLISHED]
                        │
                        ▼ (下架)
                  [已下架 UNPUBLISHED]
```

### 状态转移权限表
| 初始状态 | 目标状态 | 触发动作 | 允许角色 | 前置条件 |
| :--- | :--- | :--- | :--- | :--- |
| `DRAFT` | `PENDING_REVIEW` | 提交审核 | `partner` | 必填字段齐全、地图经纬度有效 |
| `PENDING_REVIEW` | `CHANGES_REQUESTED` | 要求修改 | `studio` | 必须附带退回原因说明 (`reviewNote`) |
| `CHANGES_REQUESTED` | `PENDING_REVIEW` | 重新提交 | `partner` | 修改内容已更新 |
| `PENDING_REVIEW` | `APPROVED` | 审核通过 | `studio` | 资料合规、点位校准无误 |
| `APPROVED` | `PUBLISHED` | 发布上线 | `studio` | 确认公开可见性 |
| `PUBLISHED` | `UNPUBLISHED` | 下架撤回 | `studio` | 填写下架原因 |
| `PENDING_REVIEW` | `REJECTED` | 拒绝入驻 | `studio` | 必须附带拒绝原因 |
