# 领域模型、API 接口与 RBAC 规范

## 1. 核心 TypeScript 实体定义

```typescript
export type PortalRole = "visitor" | "partner" | "studio";

export type ContentStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "unpublished";

export interface Organization {
  id: string;
  name: string;
  type: "merchant" | "cooperative" | "village_collective" | "scenic_area";
  contactName: string;
  contactPhone: string;
  address: string;
  verificationStatus: "verified" | "pending";
  createdAt: string;
}

export interface Place {
  id: string;
  organizationId?: string;
  name: string;
  category: "文化" | "山水" | "休闲" | "餐饮" | "住宿" | "非遗";
  summary: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  gcj02: [number, number];
  images: string[];
  openingHours: string;
  priceText: string;
  contact: string;
  status: ContentStatus;
  featured: boolean;
  publishedAt?: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  organizationId: string;
  placeId?: string;
  name: string;
  summary: string;
  description: string;
  startAt: string;
  endAt: string;
  priceText: string;
  capacity?: number;
  bookingMethod: string;
  contact: string;
  latitude: number;
  longitude: number;
  gcj02: [number, number];
  images: string[];
  status: ContentStatus;
  featured: boolean;
  publishedAt?: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  entityType: "place" | "activity";
  entityId: string;
  organizationId: string;
  submittedBy: string;
  status: ContentStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  snapshot: Place | Activity;
}

export interface MetricEvent {
  id: string;
  entityType: "place" | "activity";
  entityId: string;
  eventType: "view" | "favorite" | "navigation_start";
  createdAt: string;
}
```
