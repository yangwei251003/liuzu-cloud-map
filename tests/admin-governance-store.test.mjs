import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  ADMIN_GOVERNANCE_STORAGE_KEY,
  createEmptyAdminGovernanceData,
  readAdminGovernanceData,
  submitCorrection,
  transitionCorrectionTicket,
  transitionGovernedRecord,
} from "../src/lib/admin-governance-store.ts";

const now = "2026-08-15T08:00:00.000Z";

function operation(overrides = {}) {
  return {
    id: "operation-test-1",
    kind: "OPERATION",
    subject: "测试运营状态",
    value: "待核验",
    validFrom: "2026-08-01",
    validUntil: "2026-08-31",
    source: "测试来源",
    owner: "运营责任人",
    revision: 1,
    lastEditedBy: "运营编辑甲",
    state: "DRAFT",
    reviewDecision: null,
    publication: null,
    withdrawal: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function narration(overrides = {}) {
  return {
    id: "narration-test-1",
    kind: "NARRATION",
    title: "测试讲解资产",
    placeName: "测试地点",
    scriptVersion: "test-1",
    evidence: "测试证据",
    rightsStatus: "PENDING",
    validUntil: "2026-08-31",
    source: "测试来源",
    owner: "讲解责任人",
    revision: 1,
    lastEditedBy: "讲解编辑甲",
    state: "IN_REVIEW",
    reviewDecision: null,
    publication: null,
    withdrawal: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

afterEach(() => {
  delete globalThis.window;
});

test("未取得专业审核结论的条目不能发布", () => {
  for (const item of [operation(), operation({ state: "IN_REVIEW" })]) {
    const result = transitionGovernedRecord(
      item,
      "PUBLISH",
      { name: "发布管理员乙", role: "RELEASE_ADMIN" },
      "",
      now,
    );
    assert.equal(result.ok, false);
    assert.match(result.error, /未取得专业审核通过结论/);
  }
});

test("专业审核与发布同时校验角色和操作者姓名分离", () => {
  const inReview = operation({ state: "IN_REVIEW" });
  const wrongReviewer = transitionGovernedRecord(
    inReview,
    "APPROVE",
    { name: "内容审核员", role: "CONTENT_REVIEWER" },
    "同意",
    now,
  );
  assert.equal(wrongReviewer.ok, false);
  assert.match(wrongReviewer.error, /OPERATION_REVIEWER/);

  const approved = transitionGovernedRecord(
    inReview,
    "APPROVE",
    { name: "专业审核员甲", role: "OPERATION_REVIEWER" },
    "来源和有效期完整，同意进入发布环节。",
    now,
  );
  assert.equal(approved.ok, true);

  const wrongPublisherRole = transitionGovernedRecord(
    approved.item,
    "PUBLISH",
    { name: "发布管理员乙", role: "OPERATION_REVIEWER" },
    "",
    now,
  );
  assert.equal(wrongPublisherRole.ok, false);
  assert.match(wrongPublisherRole.error, /只有发布管理员/);

  const samePerson = transitionGovernedRecord(
    approved.item,
    "PUBLISH",
    { name: "专业审核员甲", role: "RELEASE_ADMIN" },
    "",
    now,
  );
  assert.equal(samePerson.ok, false);
  assert.match(samePerson.error, /必须与专业审核人分离/);

  const published = transitionGovernedRecord(
    approved.item,
    "PUBLISH",
    { name: "发布管理员乙", role: "RELEASE_ADMIN" },
    "",
    now,
  );
  assert.equal(published.ok, true);
  assert.equal(published.item.state, "PUBLISHED");
  assert.equal(published.item.publication.publisherName, "发布管理员乙");
  assert.equal(published.audit.actorRole, "RELEASE_ADMIN");
});

test("过期条目不能提交，也不能利用历史审核结论发布", () => {
  const expiredDraft = operation({ validUntil: "2026-08-14" });
  const submitted = transitionGovernedRecord(
    expiredDraft,
    "SUBMIT",
    { name: "运营编辑甲", role: "OPERATION_EDITOR" },
    "",
    now,
  );
  assert.equal(submitted.ok, false);
  assert.match(submitted.error, /超过有效期/);

  const expiredApproved = operation({
    state: "APPROVED",
    validUntil: "2026-08-14",
    reviewDecision: {
      decision: "APPROVED",
      reviewerName: "专业审核员甲",
      reviewerRole: "OPERATION_REVIEWER",
      note: "历史审核通过",
      decidedAt: "2026-08-14T08:00:00.000Z",
    },
  });
  const published = transitionGovernedRecord(
    expiredApproved,
    "PUBLISH",
    { name: "发布管理员乙", role: "RELEASE_ADMIN" },
    "",
    now,
  );
  assert.equal(published.ok, false);
  assert.match(published.error, /超过有效期/);
});

test("讲解资产权利未明确为 CLEARED 时不得审核通过", () => {
  for (const rightsStatus of ["PENDING", "RESTRICTED", "UNKNOWN"]) {
    const result = transitionGovernedRecord(
      narration({ rightsStatus }),
      "APPROVE",
      { name: "权利审核员甲", role: "RIGHTS_REVIEWER" },
      "已检查当前权利材料。",
      now,
    );
    assert.equal(result.ok, false, rightsStatus);
    assert.match(result.error, /权利状态尚未确认/);
  }

  const cleared = transitionGovernedRecord(
    narration({ rightsStatus: "CLEARED" }),
    "APPROVE",
    { name: "权利审核员甲", role: "RIGHTS_REVIEWER" },
    "权利材料已确认。",
    now,
  );
  assert.equal(cleared.ok, true);
  assert.equal(cleared.item.state, "APPROVED");
});

test("submitCorrection 拒绝无效 schema，并把有效工单与审计记录持久化", () => {
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };

  const missingSubject = submitCorrection({
    subject: "   ",
    detail: "测试问题",
    category: "CONTENT",
  });
  assert.equal(missingSubject.ok, false);

  const invalidCategory = submitCorrection({
    subject: "测试主题",
    detail: "测试问题",
    category: "INVALID",
  });
  assert.equal(invalidCategory.ok, false);
  assert.equal(storage.getItem(ADMIN_GOVERNANCE_STORAGE_KEY), null);

  const result = submitCorrection({
    subject: "  页面信息需要复核  ",
    detail: "  游客发现候选内容与现场提示不一致。  ",
    category: "CONTENT",
    priority: "HIGH",
    reporterAlias: "  测试游客  ",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ticket.subject, "页面信息需要复核");
  assert.equal(result.ticket.state, "RECEIVED");
  assert.equal(result.ticket.priority, "HIGH");

  const persisted = readAdminGovernanceData();
  assert.equal(persisted.error, null);
  assert.equal(persisted.data.corrections.length, 1);
  assert.equal(persisted.data.corrections[0].id, result.ticket.id);
  assert.equal(persisted.data.auditLogs.length, 1);
  assert.equal(persisted.data.auditLogs[0].entityKind, "CORRECTION");
  assert.equal(persisted.data.auditLogs[0].toState, "RECEIVED");
});

test("纠错状态机拒绝越级和错误角色，并要求责任人与闭环说明", () => {
  const ticket = {
    id: "correction-test-1",
    subject: "测试纠错",
    detail: "测试详情",
    category: "GIS",
    priority: "MEDIUM",
    state: "RECEIVED",
    reporterAlias: "测试游客",
    owner: "",
    resolution: "",
    createdAt: now,
    updatedAt: now,
  };

  const wrongRole = transitionCorrectionTicket(
    ticket,
    "TRIAGED",
    "",
    { name: "运营编辑甲", role: "OPERATION_EDITOR" },
    "完成初筛",
    now,
  );
  assert.equal(wrongRole.ok, false);
  assert.match(wrongRole.error, /只有纠错协调员/);

  const skipped = transitionCorrectionTicket(
    ticket,
    "RESOLVED",
    "GIS 责任人",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "已解决",
    now,
  );
  assert.equal(skipped.ok, false);
  assert.match(skipped.error, /不能从 RECEIVED 直接变更为 RESOLVED/);

  const triaged = transitionCorrectionTicket(
    ticket,
    "TRIAGED",
    "",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "已核对基本信息",
    now,
  );
  assert.equal(triaged.ok, true);

  const missingOwner = transitionCorrectionTicket(
    triaged.ticket,
    "ASSIGNED",
    "",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "分派处理",
    now,
  );
  assert.equal(missingOwner.ok, false);
  assert.match(missingOwner.error, /必须指定责任人/);

  const assigned = transitionCorrectionTicket(
    triaged.ticket,
    "ASSIGNED",
    "GIS 责任人",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "分派处理",
    now,
  );
  assert.equal(assigned.ok, true);
  assert.equal(assigned.ticket.owner, "GIS 责任人");

  const accepted = transitionCorrectionTicket(
    assigned.ticket,
    "ACCEPTED",
    "GIS 责任人",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "确认问题成立",
    now,
  );
  assert.equal(accepted.ok, true);

  const missingResolution = transitionCorrectionTicket(
    accepted.ticket,
    "RESOLVED",
    "GIS 责任人",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "",
    now,
  );
  assert.equal(missingResolution.ok, false);
  assert.match(missingResolution.error, /必须填写处理说明/);

  const resolved = transitionCorrectionTicket(
    accepted.ticket,
    "RESOLVED",
    "GIS 责任人",
    { name: "纠错协调员甲", role: "CORRECTION_COORDINATOR" },
    "已修正候选数据并等待下一版本发布。",
    now,
  );
  assert.equal(resolved.ok, true);
  assert.equal(resolved.ticket.state, "RESOLVED");
  assert.equal(resolved.audit.fromState, "ACCEPTED");
  assert.equal(resolved.audit.toState, "RESOLVED");
});

test("损坏的持久化纠错数据会失败关闭且不会覆盖原值", () => {
  const malformed = {
    ...createEmptyAdminGovernanceData(),
    corrections: [{ id: "incomplete" }],
  };
  const raw = JSON.stringify(malformed);
  const storage = memoryStorage({ [ADMIN_GOVERNANCE_STORAGE_KEY]: raw });
  globalThis.window = { localStorage: storage };

  const submitted = submitCorrection({
    subject: "新纠错",
    detail: "不应写入损坏存储",
    category: "OTHER",
  });
  assert.equal(submitted.ok, false);
  assert.match(submitted.error, /格式异常/);
  assert.equal(storage.getItem(ADMIN_GOVERNANCE_STORAGE_KEY), raw);
});
