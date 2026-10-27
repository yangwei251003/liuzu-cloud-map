import type {
  Place,
  Activity,
  Organization,
  Submission,
  ReviewAction,
  FavoriteItem,
  MetricEvent,
  PortalInsights,
  ContentStatus,
  EntityType,
  PortalRole,
} from "./types";
import {
  SEED_PLACES,
  SEED_ACTIVITIES,
  SEED_ORGANIZATIONS,
  SEED_SUBMISSIONS,
} from "./demo-seed-data";

import { useSyncExternalStore } from "react";

const STORAGE_KEYS = {
  PLACES: "yunmap-portal:places:v1",
  ACTIVITIES: "yunmap-portal:activities:v1",
  ORGANIZATIONS: "yunmap-portal:organizations:v1",
  SUBMISSIONS: "yunmap-portal:submissions:v1",
  FAVORITES: "yunmap-portal:favorites:v1",
  EVENTS: "yunmap-portal:metric-events:v1",
};

export const PORTAL_DATA_CHANGED_EVENT = "yunmap-portal:data-changed";

let cacheVersion = 0;
let cachedPlaces: Place[] | null = null;
let cachedActivities: Activity[] | null = null;
let cachedOrganizations: Organization[] | null = null;
let cachedSubmissions: Submission[] | null = null;
let cachedFavorites: FavoriteItem[] | null = null;
let cachedEvents: MetricEvent[] | null = null;

function invalidateCache() {
  cachedPlaces = null;
  cachedActivities = null;
  cachedOrganizations = null;
  cachedSubmissions = null;
  cachedFavorites = null;
  cachedEvents = null;
  cacheVersion++;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function notifyDataChanged() {
  invalidateCache();
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(PORTAL_DATA_CHANGED_EVENT));
  }
}

function loadStorage<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Failed to load ${key} from storage:`, e);
    return fallback;
  }
}

function saveStorage<T>(key: string, data: T) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
    notifyDataChanged();
  } catch (e) {
    console.error(`Failed to save ${key} to storage:`, e);
  }
}

// -------------------------------------------------------------
// Repository Implementation
// -------------------------------------------------------------
export class PortalDemoRepository {
  static getVersion(): number {
    return cacheVersion;
  }

  static subscribe(listener: () => void): () => void {
    if (!isBrowser()) return () => {};
    window.addEventListener(PORTAL_DATA_CHANGED_EVENT, listener);
    return () => window.removeEventListener(PORTAL_DATA_CHANGED_EVENT, listener);
  }

  // --- Initialization & Reset ---
  static initializeIfEmpty() {
    if (!isBrowser()) return;
    if (!localStorage.getItem(STORAGE_KEYS.PLACES)) {
      PortalDemoRepository.resetToSeedData();
    }
  }

  static resetToSeedData() {
    if (!isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.PLACES, JSON.stringify(SEED_PLACES));
    localStorage.setItem(STORAGE_KEYS.ACTIVITIES, JSON.stringify(SEED_ACTIVITIES));
    localStorage.setItem(STORAGE_KEYS.ORGANIZATIONS, JSON.stringify(SEED_ORGANIZATIONS));
    localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(SEED_SUBMISSIONS));
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify([]));
    notifyDataChanged();
  }

  // --- Organizations ---
  static getOrganizations(): Organization[] {
    if (!cachedOrganizations) {
      cachedOrganizations = loadStorage<Organization[]>(STORAGE_KEYS.ORGANIZATIONS, SEED_ORGANIZATIONS);
    }
    return cachedOrganizations;
  }

  static getOrganizationById(id: string): Organization | undefined {
    return this.getOrganizations().find((o) => o.id === id);
  }

  static saveOrganization(org: Organization) {
    const list = this.getOrganizations();
    const idx = list.findIndex((o) => o.id === org.id);
    if (idx >= 0) {
      list[idx] = { ...org, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...org, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    saveStorage(STORAGE_KEYS.ORGANIZATIONS, list);
  }

  // --- Places ---
  static getPlaces(options?: { status?: ContentStatus; category?: string; organizationId?: string }): Place[] {
    if (!cachedPlaces) {
      cachedPlaces = loadStorage<Place[]>(STORAGE_KEYS.PLACES, SEED_PLACES);
    }
    let list = cachedPlaces;
    if (options?.status) {
      list = list.filter((p) => p.status === options.status);
    }
    if (options?.category && options.category !== "全部") {
      list = list.filter((p) => p.category === options.category);
    }
    if (options?.organizationId) {
      list = list.filter((p) => p.organizationId === options.organizationId);
    }
    return list;
  }

  static getPlaceById(id: string): Place | undefined {
    return this.getPlaces().find((p) => p.id === id);
  }

  static savePlace(place: Place): Place {
    const list = this.getPlaces();
    const idx = list.findIndex((p) => p.id === place.id);
    const updated: Place = {
      ...place,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      list[idx] = updated;
    } else {
      updated.createdAt = new Date().toISOString();
      list.push(updated);
    }
    saveStorage(STORAGE_KEYS.PLACES, list);
    return updated;
  }

  // --- Activities ---
  static getActivities(options?: { status?: ContentStatus; category?: string; organizationId?: string }): Activity[] {
    if (!cachedActivities) {
      cachedActivities = loadStorage<Activity[]>(STORAGE_KEYS.ACTIVITIES, SEED_ACTIVITIES);
    }
    let list = cachedActivities;
    if (options?.status) {
      list = list.filter((a) => a.status === options.status);
    }
    if (options?.category && options.category !== "全部") {
      list = list.filter((a) => a.category === options.category);
    }
    if (options?.organizationId) {
      list = list.filter((a) => a.organizationId === options.organizationId);
    }
    return list;
  }

  static getActivityById(id: string): Activity | undefined {
    return this.getActivities().find((a) => a.id === id);
  }

  static saveActivity(activity: Activity): Activity {
    const list = this.getActivities();
    const idx = list.findIndex((a) => a.id === activity.id);
    const updated: Activity = {
      ...activity,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      list[idx] = updated;
    } else {
      updated.createdAt = new Date().toISOString();
      list.push(updated);
    }
    saveStorage(STORAGE_KEYS.ACTIVITIES, list);
    return updated;
  }

  // --- Submissions & Workflows ---
  static getSubmissions(options?: { organizationId?: string; status?: ContentStatus }): Submission[] {
    if (!cachedSubmissions) {
      cachedSubmissions = loadStorage<Submission[]>(STORAGE_KEYS.SUBMISSIONS, SEED_SUBMISSIONS);
    }
    let list = cachedSubmissions;
    if (options?.organizationId) {
      list = list.filter((s) => s.organizationId === options.organizationId);
    }
    if (options?.status) {
      list = list.filter((s) => s.status === options.status);
    }
    return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  static getSubmissionById(id: string): Submission | undefined {
    return this.getSubmissions().find((s) => s.id === id);
  }

  static createSubmission(params: {
    entityType: EntityType;
    entity: Place | Activity;
    organizationId: string;
    organizationName: string;
    submittedBy: string;
    note?: string;
  }): Submission {
    const submissionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const entity = params.entity;
    entity.status = "pending_review";

    if (params.entityType === "place") {
      this.savePlace(entity as Place);
    } else {
      this.saveActivity(entity as Activity);
    }

    const historyItem: ReviewAction = {
      id: `rev-${Date.now()}`,
      submissionId,
      action: "submit",
      actionName: "商户提交",
      actorId: "current-user",
      actorName: params.submittedBy,
      actorRole: "partner",
      note: params.note || "提交审核申请",
      createdAt: now,
    };

    const submission: Submission = {
      id: submissionId,
      entityType: params.entityType,
      entityId: entity.id,
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      entityTitle: entity.name,
      submittedBy: params.submittedBy,
      status: "pending_review",
      submittedAt: now,
      snapshot: entity,
      history: [historyItem],
    };

    const list = this.getSubmissions();
    list.unshift(submission);
    saveStorage(STORAGE_KEYS.SUBMISSIONS, list);
    return submission;
  }

  static resubmitSubmission(params: {
    submissionId: string;
    organizationId: string;
    actorName: string;
    actorRole: PortalRole;
    title: string;
    summary: string;
  }): Submission {
    const list = this.getSubmissions();
    const previous = list.find((item) => item.id === params.submissionId);
    if (!previous || previous.organizationId !== params.organizationId || params.actorRole !== "partner" || previous.status !== "changes_requested") {
      throw new Error("Only the owning demo partner can resubmit a changes-requested item");
    }
    const title = params.title.trim(), summary = params.summary.trim();
    if (!title || !summary || !Array.isArray(previous.history)) throw new Error("Resubmission content is incomplete");
    const now = new Date().toISOString();
    const snapshot = { ...previous.snapshot, name: title, summary, status: "pending_review" as const, updatedAt: now };
    const next: Submission = {
      ...previous, entityTitle: title, status: "pending_review", snapshot,
      reviewedAt: undefined, reviewedBy: undefined, reviewNote: undefined,
      history: [...previous.history, { id: `rev-${Date.now()}`, submissionId: previous.id, action: "resubmit", actionName: "商户修改后重新提交", actorId: "current-user", actorName: params.actorName, actorRole: "partner", note: "已按运营意见修改内容，重新申请审核", createdAt: now }],
    };
    if (previous.entityType === "place") this.savePlace(snapshot as Place);
    else this.saveActivity(snapshot as Activity);
    saveStorage(STORAGE_KEYS.SUBMISSIONS, list.map((item) => item.id === previous.id ? next : item));
    return next;
  }

  static reviewSubmission(params: {
    submissionId: string;
    action: "approve" | "publish" | "request_changes" | "reject" | "unpublish";
    reviewerName: string;
    reviewerRole: PortalRole;
    note?: string;
    overrideLocation?: { latitude: number; longitude: number; gcj02: [number, number]; address?: string };
    setFeatured?: boolean;
  }): Submission {
    const list = this.getSubmissions();
    const submission = list.find((s) => s.id === params.submissionId);
    if (!submission) throw new Error("Submission not found");

    const now = new Date().toISOString();
    let newStatus: ContentStatus = submission.status;

    if (params.action === "approve") {
      newStatus = "approved";
    } else if (params.action === "publish") {
      newStatus = "published";
    } else if (params.action === "request_changes") {
      newStatus = "changes_requested";
    } else if (params.action === "reject") {
      newStatus = "rejected";
    } else if (params.action === "unpublish") {
      newStatus = "unpublished";
    }

    submission.status = newStatus;
    submission.reviewedAt = now;
    submission.reviewedBy = params.reviewerName;
    submission.reviewNote = params.note;

    const actionMap: Record<string, string> = {
      approve: "审核通过",
      publish: "正式发布",
      request_changes: "退回需修改",
      reject: "拒绝",
      unpublish: "下架",
    };

    const historyItem: ReviewAction = {
      id: `rev-${Date.now()}`,
      submissionId: submission.id,
      action: params.action,
      actionName: actionMap[params.action] || params.action,
      actorId: "current-user",
      actorName: params.reviewerName,
      actorRole: params.reviewerRole,
      note: params.note,
      createdAt: now,
    };
    submission.history.push(historyItem);

    // 同步更新底层实体
    if (submission.entityType === "place") {
      const place = this.getPlaceById(submission.entityId);
      if (place) {
        place.status = newStatus;
        if (params.overrideLocation) {
          place.latitude = params.overrideLocation.latitude;
          place.longitude = params.overrideLocation.longitude;
          place.gcj02 = params.overrideLocation.gcj02;
          if (params.overrideLocation.address) place.address = params.overrideLocation.address;
        }
        if (params.setFeatured !== undefined) {
          place.featured = params.setFeatured;
        }
        if (newStatus === "published") {
          place.publishedAt = now;
        }
        this.savePlace(place);
        submission.snapshot = place;
      }
    } else {
      const activity = this.getActivityById(submission.entityId);
      if (activity) {
        activity.status = newStatus;
        if (params.overrideLocation) {
          activity.latitude = params.overrideLocation.latitude;
          activity.longitude = params.overrideLocation.longitude;
          activity.gcj02 = params.overrideLocation.gcj02;
          if (params.overrideLocation.address) activity.address = params.overrideLocation.address;
        }
        if (params.setFeatured !== undefined) {
          activity.featured = params.setFeatured;
        }
        if (newStatus === "published") {
          activity.publishedAt = now;
        }
        this.saveActivity(activity);
        submission.snapshot = activity;
      }
    }

    saveStorage(STORAGE_KEYS.SUBMISSIONS, list);
    return submission;
  }

  // --- Favorites (Visitor Trip) ---
  static getFavorites(): FavoriteItem[] {
    if (!cachedFavorites) {
      cachedFavorites = loadStorage<FavoriteItem[]>(STORAGE_KEYS.FAVORITES, []);
    }
    return cachedFavorites;
  }

  static isFavorite(entityType: EntityType, entityId: string): boolean {
    return this.getFavorites().some((f) => f.entityType === entityType && f.entityId === entityId);
  }

  static toggleFavorite(params: {
    entityType: EntityType;
    entityId: string;
    title: string;
    category: string;
    imageUrl?: string;
    address?: string;
  }): boolean {
    const list = this.getFavorites();
    const idx = list.findIndex((f) => f.entityType === params.entityType && f.entityId === params.entityId);
    let favorited = false;
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.unshift({
        id: `fav-${Date.now()}`,
        entityType: params.entityType,
        entityId: params.entityId,
        title: params.title,
        category: params.category,
        imageUrl: params.imageUrl,
        address: params.address,
        createdAt: new Date().toISOString(),
      });
      favorited = true;
      let orgId: string | undefined;
      if (params.entityType === "place") {
        orgId = this.getPlaceById(params.entityId)?.organizationId;
      } else {
        orgId = this.getActivityById(params.entityId)?.organizationId;
      }
      this.recordMetricEvent({
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.title,
        organizationId: orgId,
        eventType: "favorite",
      });
    }
    saveStorage(STORAGE_KEYS.FAVORITES, list);
    return favorited;
  }

  // --- Metric Events (Insights & Analytics) ---
  static getMetricEvents(): MetricEvent[] {
    if (!cachedEvents) {
      cachedEvents = loadStorage<MetricEvent[]>(STORAGE_KEYS.EVENTS, []);
    }
    return cachedEvents;
  }

  static recordMetricEvent(params: {
    entityType: EntityType;
    entityId: string;
    entityName: string;
    organizationId?: string;
    eventType: "view" | "favorite" | "navigation_start";
  }) {
    const list = this.getMetricEvents();
    const event: MetricEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      organizationId: params.organizationId,
      eventType: params.eventType,
      createdAt: new Date().toISOString(),
    };
    list.unshift(event);
    // Keep max 200 events
    if (list.length > 200) list.length = 200;
    saveStorage(STORAGE_KEYS.EVENTS, list);
  }

  static getInsights(organizationId?: string): PortalInsights {
    const allEvents = this.getMetricEvents();
    const events = organizationId
      ? allEvents.filter((e) => e.organizationId === organizationId)
      : allEvents;

    const places = this.getPlaces({ organizationId, status: "published" });
    const activities = this.getActivities({ organizationId, status: "published" });

    return {
      totalViews: events.filter((e) => e.eventType === "view").length,
      totalFavorites: events.filter((e) => e.eventType === "favorite").length,
      totalNavigations: events.filter((e) => e.eventType === "navigation_start").length,
      activePlacesCount: places.length,
      activeActivitiesCount: activities.length,
      recentEvents: events.slice(0, 10),
    };
  }
}

export function usePortalVersion(): number {
  return useSyncExternalStore(
    PortalDemoRepository.subscribe,
    () => PortalDemoRepository.getVersion(),
    () => 0
  );
}

