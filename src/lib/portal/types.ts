export type PortalRole = "visitor" | "partner" | "studio";

export type ContentStatus =
  | "draft"
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "rejected"
  | "unpublished";

export type EntityType = "place" | "activity";

export interface PortalUser {
  id: string;
  name: string;
  role: PortalRole;
  organizationId?: string;
  avatar?: string;
}

export interface Organization {
  id: string;
  name: string;
  type: "merchant" | "cooperative" | "village_collective" | "scenic_area" | "craftsman";
  typeName: string;
  contactName: string;
  contactPhone: string;
  summary: string;
  region: string;
  verificationStatus: "verified" | "pending";
  profileCompleteness: number;
  createdAt: string;
  updatedAt: string;
}

export interface Place {
  id: string;
  organizationId?: string;
  name: string;
  subtitle?: string;
  category: "文化" | "山水" | "休闲" | "餐饮" | "住宿" | "非遗" | "服务" | "在地体验";
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
  serviceTags: string[];
  status: ContentStatus;
  featured: boolean;
  featuredOrder?: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  organizationId: string;
  organizationName?: string;
  placeId?: string;
  placeName?: string;
  name: string;
  subtitle?: string;
  category: "文化体验" | "农旅采摘" | "非遗手作" | "研学讲座" | "节庆民俗" | "休闲康养";
  summary: string;
  description: string;
  startAt: string;
  endAt: string;
  timeDescription: string;
  priceText: string;
  capacity?: number;
  bookingMethod: "无需预约" | "电话预约" | "现场登记" | "线上预约";
  contact: string;
  address: string;
  latitude: number;
  longitude: number;
  gcj02: [number, number];
  images: string[];
  tags: string[];
  status: ContentStatus;
  featured: boolean;
  featuredOrder?: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAction {
  id: string;
  submissionId: string;
  action: "submit" | "request_changes" | "approve" | "publish" | "reject" | "unpublish" | "resubmit";
  actionName: string;
  actorId: string;
  actorName: string;
  actorRole: PortalRole;
  note?: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  entityType: EntityType;
  entityId: string;
  organizationId: string;
  organizationName: string;
  entityTitle: string;
  submittedBy: string;
  status: ContentStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  snapshot: Place | Activity;
  history: ReviewAction[];
}

export interface FavoriteItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  category: string;
  imageUrl?: string;
  address?: string;
  createdAt: string;
}

export interface MetricEvent {
  id: string;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  organizationId?: string;
  eventType: "view" | "favorite" | "navigation_start";
  createdAt: string;
}

export interface PortalInsights {
  totalViews: number;
  totalFavorites: number;
  totalNavigations: number;
  activePlacesCount: number;
  activeActivitiesCount: number;
  recentEvents: MetricEvent[];
}
