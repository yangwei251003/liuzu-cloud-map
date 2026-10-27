import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage for Node test environment
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
};
global.CustomEvent = class {
  constructor(type, detail) {
    this.type = type;
    this.detail = detail;
  }
};

import { canTransition } from "../src/lib/portal/content-status-machine.ts";
import { getRolePermissions, canAccessRoute } from "../src/lib/portal/rbac.ts";
import { PortalDemoRepository } from "../src/lib/portal/demo-repository.ts";

test("Status Machine: allows valid transitions for correct roles", () => {
  // 商户提交草稿
  assert.equal(canTransition("draft", "pending_review", "partner"), true);
  // 游客不能提交草稿
  assert.equal(canTransition("draft", "pending_review", "visitor"), false);
  // 管理端审核通过
  assert.equal(canTransition("pending_review", "approved", "studio"), true);
  // 管理端直接审核并通过发布
  assert.equal(canTransition("pending_review", "published", "studio"), true);
  // 管理端要求修改
  assert.equal(canTransition("pending_review", "changes_requested", "studio"), true);
  // 商户不能自己审核通过或发布
  assert.equal(canTransition("pending_review", "published", "partner"), false);
  assert.equal(canTransition("pending_review", "approved", "partner"), false);
  // 商户在被退回后重新提交
  assert.equal(canTransition("changes_requested", "pending_review", "partner"), true);
});

test("RBAC: verifies role permissions accurately", () => {
  const visitorPerms = getRolePermissions("visitor");
  assert.equal(visitorPerms.canPublishContent, false);
  assert.equal(visitorPerms.canViewAllSubmissions, false);

  const partnerPerms = getRolePermissions("partner");
  assert.equal(partnerPerms.canSubmitContent, true);
  assert.equal(partnerPerms.canPublishContent, false); // 商户不能发布

  const studioPerms = getRolePermissions("studio");
  assert.equal(studioPerms.canPublishContent, true);
  assert.equal(studioPerms.canReviewSubmissions, true);
  assert.equal(studioPerms.canManageFeatured, true);
});

test("RBAC: route access control", () => {
  assert.equal(canAccessRoute("/studio/reviews", "visitor"), false);
  assert.equal(canAccessRoute("/studio/reviews", "partner"), false);
  assert.equal(canAccessRoute("/studio/reviews", "studio"), true);

  assert.equal(canAccessRoute("/partner/workbench", "visitor"), false);
  assert.equal(canAccessRoute("/partner/workbench", "partner"), true);
  assert.equal(canAccessRoute("/map", "visitor"), true);
});

test("Repository: seed data & reset", () => {
  PortalDemoRepository.resetToSeedData();

  const places = PortalDemoRepository.getPlaces();
  assert.ok(places.length >= 4, "Should have initial places");

  const activities = PortalDemoRepository.getActivities();
  assert.ok(activities.length >= 2, "Should have initial activities");

  const orgs = PortalDemoRepository.getOrganizations();
  assert.ok(orgs.length >= 3, "Should have initial organizations");
});

test("Repository: full submission review workflow", () => {
  PortalDemoRepository.resetToSeedData();

  // 1. 商户提交新活动
  const newActivity = {
    id: "test-act-01",
    organizationId: "org-liuzu-tea",
    organizationName: "六祖镇禅茶生态种植合作社",
    name: "测试采茶活动",
    category: "文化体验",
    summary: "简短摘要",
    description: "详尽描述",
    startAt: "2026-09-01T09:00:00Z",
    endAt: "2026-09-01T12:00:00Z",
    timeDescription: "上午9点",
    priceText: "免费",
    bookingMethod: "无需预约",
    contact: "13800000000",
    address: "测试茶园",
    latitude: 22.58,
    longitude: 112.23,
    gcj02: [112.235, 22.575],
    images: [],
    tags: ["采茶"],
    status: "draft",
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sub = PortalDemoRepository.createSubmission({
    entityType: "activity",
    entity: newActivity,
    organizationId: "org-liuzu-tea",
    organizationName: "六祖镇禅茶生态种植合作社",
    submittedBy: "陈掌柜",
    note: "申请上线",
  });

  assert.equal(sub.status, "pending_review");

  // 2. Studio 审核并发布
  const reviewed = PortalDemoRepository.reviewSubmission({
    submissionId: sub.id,
    action: "publish",
    reviewerName: "林主管",
    reviewerRole: "studio",
    note: "符合规范，准予发布",
    setFeatured: true,
  });

  assert.equal(reviewed.status, "published");
  assert.ok(reviewed.reviewedAt);

  // 3. 游客端能检索到已发布活动
  const publishedActs = PortalDemoRepository.getActivities({ status: "published" });
  const found = publishedActs.find((a) => a.id === "test-act-01");
  assert.ok(found, "Published activity should be retrievable by visitor");
  assert.equal(found.featured, true);
});

test("Repository: visitor favorites and metric tracking", () => {
  PortalDemoRepository.resetToSeedData();

  // 游客收藏
  const isFav = PortalDemoRepository.toggleFavorite({
    entityType: "place",
    entityId: "place-guoen-temple",
    title: "国恩寺",
    category: "文化",
  });
  assert.equal(isFav, true);
  assert.equal(PortalDemoRepository.isFavorite("place", "place-guoen-temple"), true);

  // 触发导航事件
  PortalDemoRepository.recordMetricEvent({
    entityType: "place",
    entityId: "place-guoen-temple",
    entityName: "国恩寺",
    eventType: "navigation_start",
  });

  const insights = PortalDemoRepository.getInsights();
  assert.ok(insights.totalFavorites >= 1);
  assert.ok(insights.totalNavigations >= 1);
});
