import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage and window for Node test environment
const mockStorage = new Map();
const storageMock = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};
global.localStorage = storageMock;
global.window = {
  dispatchEvent: () => {},
  localStorage: storageMock,
  addEventListener: () => {},
  removeEventListener: () => {},
};
global.CustomEvent = class {
  constructor(type, detail) {
    this.type = type;
    this.detail = detail;
  }
};

import { PortalDemoRepository } from "../src/lib/portal/demo-repository.ts";

test("Golden Path E2E: Partner -> Studio Review & Map Calibration -> Visitor Discovery & Nav -> Partner Insights", () => {
  // Step 0: Initialize
  PortalDemoRepository.resetToSeedData();
  const initialPendingCount = PortalDemoRepository.getSubmissions({ status: "pending_review" }).length;

  // Step 1: Partner creates and submits an activity
  const newActivity = {
    id: `act-${Date.now()}`,
    organizationId: "org-liuzu-tea",
    organizationName: "六祖镇禅茶种植专业合作社",
    name: "金秋禅茶雅集与制茶手作体验",
    category: "特色体验",
    summary: "在国恩寺后山千年茶园亲手采摘秋茶、体验古法杀青、品鉴禅茶一味",
    description: "由非遗制茶传承人带领，在国恩寺后山茶园体验采茶、揉捻、焙火全流程。",
    startAt: "2026-09-01",
    endAt: "2026-11-30",
    timeDescription: "每日 09:30-11:30 / 14:30-16:30",
    priceText: "¥168/位（含茶礼带走）",
    capacity: 20,
    bookingMethod: "提前1天电话预约",
    contact: "138-0013-8001",
    address: "新兴县六祖镇国恩寺后山茶园基地3号院",
    latitude: 22.5885,
    longitude: 112.2310,
    gcj02: [112.2361, 22.5856],
    images: ["/images/scenic/guon-temple.webp"],
    tags: ["采茶", "非遗体验", "亲子研学"],
    status: "draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const newSubmission = PortalDemoRepository.createSubmission({
    entityType: "activity",
    entity: newActivity,
    organizationId: "org-liuzu-tea",
    organizationName: "六祖镇禅茶种植专业合作社",
    submittedBy: "六祖禅茶负责人 (黄经理)",
    note: "申报金秋禅茶雅集与体验",
  });

  assert.equal(newSubmission.status, "pending_review");
  const pendingListAfter = PortalDemoRepository.getSubmissions({ status: "pending_review" });
  assert.equal(pendingListAfter.length, initialPendingCount + 1);

  // Step 2: Studio Admin reviews, calibrates coordinates on map, and publishes
  const targetSub = PortalDemoRepository.getSubmissionById(newSubmission.id);
  assert.ok(targetSub);

  const updatedSub = PortalDemoRepository.reviewSubmission({
    submissionId: targetSub.id,
    action: "publish",
    reviewerName: "Studio 总编",
    reviewerRole: "studio",
    note: "内容符合要求，经纬度已落图校准，设为精选推荐",
    overrideLocation: {
      latitude: 22.5890,
      longitude: 112.2320,
      gcj02: [112.2371, 22.5861],
    },
    setFeatured: true,
  });

  assert.equal(updatedSub.status, "published");

  // Step 3: Visitor discovers published activity, views details, favorites, and starts navigation
  const publishedActivities = PortalDemoRepository.getActivities({ status: "published" });
  const foundInCatalog = publishedActivities.find((a) => a.id === targetSub.entityId);
  assert.ok(foundInCatalog);
  assert.equal(foundInCatalog.name, "金秋禅茶雅集与制茶手作体验");
  assert.equal(foundInCatalog.latitude, 22.5890);
  assert.equal(foundInCatalog.featured, true);

  // Visitor views activity detail
  PortalDemoRepository.recordMetricEvent({
    entityType: "activity",
    entityId: foundInCatalog.id,
    entityName: foundInCatalog.name,
    organizationId: foundInCatalog.organizationId,
    eventType: "view",
  });

  // Visitor adds to favorites
  const favState = PortalDemoRepository.toggleFavorite({
    entityType: "activity",
    entityId: foundInCatalog.id,
    title: foundInCatalog.name,
    category: foundInCatalog.category,
  });
  assert.equal(favState, true);
  assert.equal(PortalDemoRepository.isFavorite("activity", foundInCatalog.id), true);

  // Visitor clicks "Start Navigation"
  PortalDemoRepository.recordMetricEvent({
    entityType: "activity",
    entityId: foundInCatalog.id,
    entityName: foundInCatalog.name,
    organizationId: foundInCatalog.organizationId,
    eventType: "navigation_start",
  });

  // Step 4: Partner views live insights dashboard
  const partnerInsights = PortalDemoRepository.getInsights("org-liuzu-tea");
  assert.ok(partnerInsights.totalViews >= 1);
  assert.ok(partnerInsights.totalFavorites >= 1);
  assert.ok(partnerInsights.totalNavigations >= 1);
  assert.ok(partnerInsights.recentEvents.length >= 3);

  // Step 5: Test Reset to seed data
  PortalDemoRepository.resetToSeedData();
  const resetPending = PortalDemoRepository.getSubmissions({ status: "pending_review" });
  assert.equal(resetPending.length, initialPendingCount);
});
