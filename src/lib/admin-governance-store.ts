export const ADMIN_GOVERNANCE_STORAGE_KEY = "liuzu-cloud-tour:admin-governance:v1";

export type WorkflowState =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "WITHDRAWN";

export type EffectiveWorkflowState = WorkflowState | "EXPIRED";

export type EditorRole =
  | "OPERATION_EDITOR"
  | "CONTENT_EDITOR"
  | "GIS_EDITOR"
  | "NARRATION_EDITOR";

export type ReviewerRole =
  | "OPERATION_REVIEWER"
  | "CONTENT_REVIEWER"
  | "GIS_REVIEWER"
  | "RIGHTS_REVIEWER";

export type AdminRole = EditorRole | ReviewerRole | "RELEASE_ADMIN" | "CORRECTION_COORDINATOR";

export type Actor = {
  name: string;
  role: AdminRole;
};

export type ReviewDecision = {
  decision: "APPROVED" | "REJECTED";
  reviewerName: string;
  reviewerRole: ReviewerRole;
  note: string;
  decidedAt: string;
};

export type PublicationRecord = {
  publisherName: string;
  publisherRole: "RELEASE_ADMIN";
  publishedAt: string;
  revision: number;
};

export type WithdrawalRecord = {
  withdrawnBy: string;
  withdrawnAt: string;
  reason: string;
};

type GovernedBase = {
  id: string;
  state: WorkflowState;
  source: string;
  owner: string;
  revision: number;
  lastEditedBy: string;
  reviewDecision: ReviewDecision | null;
  publication: PublicationRecord | null;
  withdrawal: WithdrawalRecord | null;
  createdAt: string;
  updatedAt: string;
};

export type OperationalStatus = GovernedBase & {
  kind: "OPERATION";
  subject: string;
  value: string;
  validFrom: string;
  validUntil: string;
};

export type FactType =
  | "OFFICIAL_CURRENT"
  | "HISTORICAL_RECORD"
  | "RELIGIOUS_TRADITION"
  | "LOCAL_LEGEND"
  | "INTERPRETATION"
  | "MARKETING_CLAIM"
  | "UGC_EXPERIENCE"
  | "REALTIME_STATUS";

export type KnowledgeClaim = GovernedBase & {
  kind: "KNOWLEDGE";
  claim: string;
  factType: FactType;
  evidence: string;
  validUntil: string;
};

export type GisObjectType = "BOUNDARY" | "ENTRANCE" | "PATH" | "FACILITY" | "POI";

export type GisReleaseItem = GovernedBase & {
  kind: "GIS";
  name: string;
  objectType: GisObjectType;
  coordinateSystem: string;
  evidence: string;
  validUntil: string;
};

export type RightsStatus = "PENDING" | "CLEARED" | "RESTRICTED" | "UNKNOWN";

export type NarrationAsset = GovernedBase & {
  kind: "NARRATION";
  title: string;
  placeName: string;
  scriptVersion: string;
  evidence: string;
  rightsStatus: RightsStatus;
  validUntil: string;
};

export type GovernedRecord = OperationalStatus | KnowledgeClaim | GisReleaseItem | NarrationAsset;

export type CorrectionState =
  | "RECEIVED"
  | "TRIAGED"
  | "ASSIGNED"
  | "NEEDS_INFO"
  | "ACCEPTED"
  | "REJECTED"
  | "RESOLVED"
  | "CLOSED";

export type CorrectionPriority = "LOW" | "MEDIUM" | "HIGH";

export type CorrectionTicket = {
  id: string;
  subject: string;
  detail: string;
  category: "OPERATION" | "CONTENT" | "GIS" | "NARRATION" | "OTHER";
  priority: CorrectionPriority;
  state: CorrectionState;
  reporterAlias: string;
  owner: string;
  resolution: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditAction =
  | "CREATED"
  | "UPDATED"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED"
  | "WITHDRAWN"
  | "CORRECTION_UPDATED"
  | "DEMO_LOADED";

export type AuditLog = {
  id: string;
  entityKind: GovernedRecord["kind"] | "CORRECTION" | "SYSTEM";
  entityId: string;
  entityName: string;
  action: AuditAction;
  actorName: string;
  actorRole: AdminRole | "EXTERNAL_REPORTER" | "SYSTEM";
  fromState: string | null;
  toState: string;
  note: string;
  at: string;
};

export type AdminGovernanceData = {
  version: 1;
  operations: OperationalStatus[];
  claims: KnowledgeClaim[];
  gisItems: GisReleaseItem[];
  narrations: NarrationAsset[];
  corrections: CorrectionTicket[];
  auditLogs: AuditLog[];
  updatedAt: string | null;
};

export type StorageReadResult = { data: AdminGovernanceData; error: string | null };
export type StorageWriteResult = { ok: true } | { ok: false; error: string };

export type WorkflowAction = "SUBMIT" | "APPROVE" | "REJECT" | "PUBLISH" | "WITHDRAW";

export type WorkflowTransitionResult<T extends GovernedRecord> =
  | { ok: true; item: T; audit: AuditLog }
  | { ok: false; error: string };

export type CorrectionTransitionResult =
  | { ok: true; ticket: CorrectionTicket; audit: AuditLog }
  | { ok: false; error: string };

export type SubmitCorrectionInput = {
  subject: string;
  detail: string;
  category: CorrectionTicket["category"];
  priority?: CorrectionPriority;
  reporterAlias?: string;
};

export type SubmitCorrectionResult =
  | { ok: true; ticket: CorrectionTicket; data: AdminGovernanceData }
  | { ok: false; error: string };

type UnknownRecord = Record<string, unknown>;

const workflowStates: WorkflowState[] = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "WITHDRAWN"];
const reviewerRoles: ReviewerRole[] = ["OPERATION_REVIEWER", "CONTENT_REVIEWER", "GIS_REVIEWER", "RIGHTS_REVIEWER"];
const adminRoles: AdminRole[] = [
  "OPERATION_EDITOR",
  "CONTENT_EDITOR",
  "GIS_EDITOR",
  "NARRATION_EDITOR",
  ...reviewerRoles,
  "RELEASE_ADMIN",
  "CORRECTION_COORDINATOR",
];
const factTypes: FactType[] = ["OFFICIAL_CURRENT", "HISTORICAL_RECORD", "RELIGIOUS_TRADITION", "LOCAL_LEGEND", "INTERPRETATION", "MARKETING_CLAIM", "UGC_EXPERIENCE", "REALTIME_STATUS"];
const gisObjectTypes: GisObjectType[] = ["BOUNDARY", "ENTRANCE", "PATH", "FACILITY", "POI"];
const rightsStatuses: RightsStatus[] = ["PENDING", "CLEARED", "RESTRICTED", "UNKNOWN"];
const correctionStates: CorrectionState[] = ["RECEIVED", "TRIAGED", "ASSIGNED", "NEEDS_INFO", "ACCEPTED", "REJECTED", "RESOLVED", "CLOSED"];
const correctionCategories: CorrectionTicket["category"][] = ["OPERATION", "CONTENT", "GIS", "NARRATION", "OTHER"];
const correctionPriorities: CorrectionPriority[] = ["LOW", "MEDIUM", "HIGH"];
const auditActions: AuditAction[] = ["CREATED", "UPDATED", "SUBMITTED", "APPROVED", "REJECTED", "PUBLISHED", "WITHDRAWN", "CORRECTION_UPDATED", "DEMO_LOADED"];

const editorByKind: Record<GovernedRecord["kind"], EditorRole> = {
  OPERATION: "OPERATION_EDITOR",
  KNOWLEDGE: "CONTENT_EDITOR",
  GIS: "GIS_EDITOR",
  NARRATION: "NARRATION_EDITOR",
};

const reviewerByKind: Record<GovernedRecord["kind"], ReviewerRole> = {
  OPERATION: "OPERATION_REVIEWER",
  KNOWLEDGE: "CONTENT_REVIEWER",
  GIS: "GIS_REVIEWER",
  NARRATION: "RIGHTS_REVIEWER",
};

const correctionTransitions: Record<CorrectionState, CorrectionState[]> = {
  RECEIVED: ["TRIAGED"],
  TRIAGED: ["ASSIGNED", "NEEDS_INFO", "REJECTED"],
  ASSIGNED: ["NEEDS_INFO", "ACCEPTED", "REJECTED"],
  NEEDS_INFO: ["TRIAGED", "ASSIGNED"],
  ACCEPTED: ["RESOLVED"],
  REJECTED: ["CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function createEmptyAdminGovernanceData(): AdminGovernanceData {
  return {
    version: 1,
    operations: [],
    claims: [],
    gisItems: [],
    narrations: [],
    corrections: [],
    auditLogs: [],
    updatedAt: null,
  };
}

export function createAdminId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return `${prefix}-${randomId}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function recordName(item: GovernedRecord): string {
  switch (item.kind) {
    case "OPERATION":
      return item.subject;
    case "KNOWLEDGE":
      return item.claim;
    case "GIS":
      return item.name;
    case "NARRATION":
      return item.title;
  }
}

export function expectedEditorRole(kind: GovernedRecord["kind"]): EditorRole {
  return editorByKind[kind];
}

export function expectedReviewerRole(kind: GovernedRecord["kind"]): ReviewerRole {
  return reviewerByKind[kind];
}

export function getEffectiveWorkflowState(
  item: GovernedRecord,
  at = new Date(),
): EffectiveWorkflowState {
  if (item.state === "WITHDRAWN") return "WITHDRAWN";
  if (!item.validUntil) return item.state;
  const expiresAt = new Date(`${item.validUntil}T23:59:59`);
  if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < at.getTime()) return "EXPIRED";
  return item.state;
}

export function createAuditLog(input: Omit<AuditLog, "id" | "at"> & { at?: string }): AuditLog {
  return {
    ...input,
    id: createAdminId("audit"),
    at: input.at ?? new Date().toISOString(),
  };
}

function hasRequiredEvidence(item: GovernedRecord): boolean {
  if (!item.source.trim() || !item.owner.trim()) return false;
  if (item.kind === "OPERATION") {
    return Boolean(item.value.trim() && item.validFrom && item.validUntil);
  }
  return Boolean(item.evidence.trim());
}

function workflowError<T extends GovernedRecord>(error: string): WorkflowTransitionResult<T> {
  return { ok: false, error };
}

export function transitionGovernedRecord<T extends GovernedRecord>(
  item: T,
  action: WorkflowAction,
  actor: Actor,
  note = "",
  now = new Date().toISOString(),
): WorkflowTransitionResult<T> {
  const actorName = actor.name.trim();
  const cleanNote = note.trim();
  if (!actorName) return workflowError("请先填写当前操作者姓名或岗位代号。");

  let nextState: WorkflowState;
  let nextReview = item.reviewDecision;
  let nextPublication = item.publication;
  let nextWithdrawal = item.withdrawal;
  let auditAction: AuditAction;

  if (action === "SUBMIT") {
    if (actor.role !== editorByKind[item.kind]) {
      return workflowError(`只有${editorByKind[item.kind]}可以提交此类条目。`);
    }
    if (item.state !== "DRAFT" && item.state !== "REJECTED") {
      return workflowError("只有草稿或被驳回的条目可以提交审核。");
    }
    if (getEffectiveWorkflowState(item, new Date(now)) === "EXPIRED") {
      return workflowError("条目已超过有效期，请先更新草稿再提交审核。");
    }
    if (!hasRequiredEvidence(item)) return workflowError("来源、责任人、有效期或证据尚不完整，不能提交审核。");
    nextState = "IN_REVIEW";
    nextReview = null;
    nextPublication = null;
    nextWithdrawal = null;
    auditAction = "SUBMITTED";
  } else if (action === "APPROVE" || action === "REJECT") {
    const expectedRole = reviewerByKind[item.kind];
    if (actor.role !== expectedRole) return workflowError(`此条目必须由${expectedRole}执行专业审核。`);
    if (item.state !== "IN_REVIEW") return workflowError("只有审核中的条目可以作出专业结论。");
    if (actorName === item.lastEditedBy) return workflowError("编辑者不能审核自己提交的条目，请更换独立审核人。");
    if (!cleanNote) return workflowError("专业审核必须填写结论说明。");
    if (action === "APPROVE" && item.kind === "NARRATION" && item.rightsStatus !== "CLEARED") {
      return workflowError("讲解资产的权利状态尚未确认，不得通过审核。");
    }
    nextState = action === "APPROVE" ? "APPROVED" : "REJECTED";
    nextReview = {
      decision: nextState,
      reviewerName: actorName,
      reviewerRole: expectedRole,
      note: cleanNote,
      decidedAt: now,
    };
    nextPublication = null;
    auditAction = action === "APPROVE" ? "APPROVED" : "REJECTED";
  } else if (action === "PUBLISH") {
    if (actor.role !== "RELEASE_ADMIN") return workflowError("只有发布管理员可以执行发布。");
    if (item.state !== "APPROVED" || item.reviewDecision?.decision !== "APPROVED") {
      return workflowError("未取得专业审核通过结论，禁止发布。");
    }
    if (actorName === item.reviewDecision.reviewerName) {
      return workflowError("发布管理员必须与专业审核人分离，请更换操作者。");
    }
    if (getEffectiveWorkflowState(item, new Date(now)) === "EXPIRED") {
      return workflowError("条目已超过有效期，必须更新并重新审核后才能发布。");
    }
    if (!hasRequiredEvidence(item)) return workflowError("来源、责任人、有效期或证据不完整，禁止发布。");
    nextState = "PUBLISHED";
    nextPublication = {
      publisherName: actorName,
      publisherRole: "RELEASE_ADMIN",
      publishedAt: now,
      revision: item.revision,
    };
    nextWithdrawal = null;
    auditAction = "PUBLISHED";
  } else {
    if (actor.role !== "RELEASE_ADMIN") return workflowError("只有发布管理员可以撤回已发布条目。");
    if (item.state !== "PUBLISHED") return workflowError("只有已发布条目可以撤回。");
    if (!cleanNote) return workflowError("撤回必须填写原因，便于保留审计依据。");
    nextState = "WITHDRAWN";
    nextWithdrawal = { withdrawnBy: actorName, withdrawnAt: now, reason: cleanNote };
    auditAction = "WITHDRAWN";
  }

  const nextItem = {
    ...item,
    state: nextState,
    reviewDecision: nextReview,
    publication: nextPublication,
    withdrawal: nextWithdrawal,
    updatedAt: now,
  } as T;

  return {
    ok: true,
    item: nextItem,
    audit: createAuditLog({
      entityKind: item.kind,
      entityId: item.id,
      entityName: recordName(item),
      action: auditAction,
      actorName,
      actorRole: actor.role,
      fromState: item.state,
      toState: nextState,
      note: cleanNote,
      at: now,
    }),
  };
}

export function allowedCorrectionTransitions(state: CorrectionState): CorrectionState[] {
  return correctionTransitions[state];
}

/**
 * Public, local-only intake API shared by visitor and admin prototypes.
 * It validates, appends and persists one correction together with its audit entry.
 */
export function submitCorrection(input: SubmitCorrectionInput): SubmitCorrectionResult {
  const subject = input.subject.trim();
  const detail = input.detail.trim();
  const reporterAlias = input.reporterAlias?.trim() || "匿名游客";
  if (!subject) return { ok: false, error: "请填写需要纠正的信息主题。" };
  if (!detail) return { ok: false, error: "请描述发现的问题或建议的正确内容。" };
  if (!correctionCategories.includes(input.category)) return { ok: false, error: "纠错分类无效。" };
  if (input.priority && !correctionPriorities.includes(input.priority)) return { ok: false, error: "纠错优先级无效。" };
  if (subject.length > 120 || detail.length > 2000 || reporterAlias.length > 60) {
    return { ok: false, error: "纠错内容超出本地原型允许的长度。" };
  }

  const read = readAdminGovernanceData();
  if (read.error) return { ok: false, error: read.error };
  const now = new Date().toISOString();
  const ticket: CorrectionTicket = {
    id: createAdminId("correction"),
    subject,
    detail,
    category: input.category,
    priority: input.priority ?? "MEDIUM",
    state: "RECEIVED",
    reporterAlias,
    owner: "",
    resolution: "",
    createdAt: now,
    updatedAt: now,
  };
  const audit = createAuditLog({
    entityKind: "CORRECTION",
    entityId: ticket.id,
    entityName: ticket.subject,
    action: "CREATED",
    actorName: reporterAlias,
    actorRole: "EXTERNAL_REPORTER",
    fromState: null,
    toState: "RECEIVED",
    note: "游客端或后台原型提交的本机纠错。",
    at: now,
  });
  const data: AdminGovernanceData = {
    ...read.data,
    corrections: [ticket, ...read.data.corrections],
    auditLogs: [audit, ...read.data.auditLogs],
    updatedAt: now,
  };
  const write = writeAdminGovernanceData(data);
  if (!write.ok) return write;
  return { ok: true, ticket, data };
}

export function transitionCorrectionTicket(
  ticket: CorrectionTicket,
  nextState: CorrectionState,
  owner: string,
  actor: Actor,
  note = "",
  now = new Date().toISOString(),
): CorrectionTransitionResult {
  const actorName = actor.name.trim();
  const cleanOwner = owner.trim();
  if (actor.role !== "CORRECTION_COORDINATOR") {
    return { ok: false, error: "只有纠错协调员可以分派或推进纠错工单。" };
  }
  if (!actorName) return { ok: false, error: "请先填写当前操作者姓名或岗位代号。" };
  if (!correctionTransitions[ticket.state].includes(nextState)) {
    return { ok: false, error: `工单不能从 ${ticket.state} 直接变更为 ${nextState}。` };
  }
  if (["ASSIGNED", "ACCEPTED", "RESOLVED"].includes(nextState) && !cleanOwner) {
    return { ok: false, error: "进入该状态前必须指定责任人。" };
  }
  if (["REJECTED", "RESOLVED", "CLOSED"].includes(nextState) && !note.trim()) {
    return { ok: false, error: "拒绝、解决或关闭工单时必须填写处理说明。" };
  }

  const next = { ...ticket, state: nextState, owner: cleanOwner, resolution: note.trim(), updatedAt: now };
  return {
    ok: true,
    ticket: next,
    audit: createAuditLog({
      entityKind: "CORRECTION",
      entityId: ticket.id,
      entityName: ticket.subject,
      action: "CORRECTION_UPDATED",
      actorName,
      actorRole: actor.role,
      fromState: ticket.state,
      toState: nextState,
      note: note.trim(),
      at: now,
    }),
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isReviewDecision(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      (value.decision === "APPROVED" || value.decision === "REJECTED") &&
      isString(value.reviewerName) &&
      reviewerRoles.includes(value.reviewerRole as ReviewerRole) &&
      isString(value.note) &&
      isString(value.decidedAt))
  );
}

function isPublicationRecord(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isString(value.publisherName) &&
      value.publisherRole === "RELEASE_ADMIN" &&
      isString(value.publishedAt) &&
      typeof value.revision === "number")
  );
}

function isWithdrawalRecord(value: unknown): boolean {
  return value === null || (isRecord(value) && isString(value.withdrawnBy) && isString(value.withdrawnAt) && isString(value.reason));
}

function isGovernedRecord(value: unknown, kind: GovernedRecord["kind"]): boolean {
  if (!isRecord(value) || value.kind !== kind) return false;
  const baseValid =
    isString(value.id) &&
    workflowStates.includes(value.state as WorkflowState) &&
    isString(value.source) &&
    isString(value.owner) &&
    typeof value.revision === "number" &&
    isString(value.lastEditedBy) &&
    isReviewDecision(value.reviewDecision) &&
    isPublicationRecord(value.publication) &&
    isWithdrawalRecord(value.withdrawal) &&
    isString(value.createdAt) &&
    isString(value.updatedAt);
  if (!baseValid) return false;
  if (kind === "OPERATION") {
    return isString(value.subject) && isString(value.value) && isString(value.validFrom) && isString(value.validUntil);
  }
  if (kind === "KNOWLEDGE") {
    return isString(value.claim) && factTypes.includes(value.factType as FactType) && isString(value.evidence) && isString(value.validUntil);
  }
  if (kind === "GIS") {
    return (
      isString(value.name) &&
      gisObjectTypes.includes(value.objectType as GisObjectType) &&
      isString(value.coordinateSystem) &&
      isString(value.evidence) &&
      isString(value.validUntil)
    );
  }
  return (
    isString(value.title) &&
    isString(value.placeName) &&
    isString(value.scriptVersion) &&
    isString(value.evidence) &&
    rightsStatuses.includes(value.rightsStatus as RightsStatus) &&
    isString(value.validUntil)
  );
}

function isCorrection(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.subject) &&
    isString(value.detail) &&
    correctionCategories.includes(value.category as CorrectionTicket["category"]) &&
    correctionPriorities.includes(value.priority as CorrectionPriority) &&
    correctionStates.includes(value.state as CorrectionState) &&
    isString(value.reporterAlias) &&
    isString(value.owner) &&
    isString(value.resolution) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isAudit(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.entityKind) &&
    isString(value.entityId) &&
    isString(value.entityName) &&
    auditActions.includes(value.action as AuditAction) &&
    isString(value.actorName) &&
    (adminRoles.includes(value.actorRole as AdminRole) || value.actorRole === "EXTERNAL_REPORTER" || value.actorRole === "SYSTEM") &&
    (value.fromState === null || isString(value.fromState)) &&
    isString(value.toState) &&
    isString(value.note) &&
    isString(value.at)
  );
}

function parseAdminGovernanceData(value: unknown): AdminGovernanceData | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    !Array.isArray(value.operations) ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.gisItems) ||
    !Array.isArray(value.narrations) ||
    !Array.isArray(value.corrections) ||
    !Array.isArray(value.auditLogs)
  ) {
    return null;
  }
  if (
    !value.operations.every((item) => isGovernedRecord(item, "OPERATION")) ||
    !value.claims.every((item) => isGovernedRecord(item, "KNOWLEDGE")) ||
    !value.gisItems.every((item) => isGovernedRecord(item, "GIS")) ||
    !value.narrations.every((item) => isGovernedRecord(item, "NARRATION")) ||
    !value.corrections.every(isCorrection) ||
    !value.auditLogs.every(isAudit) ||
    !(value.updatedAt === null || isString(value.updatedAt))
  ) {
    return null;
  }
  return value as AdminGovernanceData;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAdminGovernanceData(): StorageReadResult {
  const storage = browserStorage();
  if (!storage) {
    return {
      data: createEmptyAdminGovernanceData(),
      error: typeof window === "undefined" ? null : "当前浏览器不允许访问本地存储，治理数据暂时无法读取。",
    };
  }
  try {
    const raw = storage.getItem(ADMIN_GOVERNANCE_STORAGE_KEY);
    if (!raw) return { data: createEmptyAdminGovernanceData(), error: null };
    const parsed = parseAdminGovernanceData(JSON.parse(raw) as unknown);
    if (!parsed) {
      return {
        data: createEmptyAdminGovernanceData(),
        error: "本地治理数据格式异常。原数据没有被覆盖，可重试或清除损坏数据。",
      };
    }
    return { data: parsed, error: null };
  } catch {
    return {
      data: createEmptyAdminGovernanceData(),
      error: "读取本地治理数据失败。原数据没有被覆盖，请稍后重试。",
    };
  }
}

export function writeAdminGovernanceData(data: AdminGovernanceData): StorageWriteResult {
  const storage = browserStorage();
  if (!storage) return { ok: false, error: "当前浏览器不允许本地保存，请检查隐私模式或存储权限。" };
  try {
    storage.setItem(ADMIN_GOVERNANCE_STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch {
    return { ok: false, error: "本地空间不足或保存被阻止，请先导出治理数据再清理空间。" };
  }
}

export function clearAdminGovernanceData(): StorageWriteResult {
  const storage = browserStorage();
  if (!storage) return { ok: false, error: "当前浏览器不允许访问本地存储，无法清除数据。" };
  try {
    storage.removeItem(ADMIN_GOVERNANCE_STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false, error: "清除本地治理数据失败，请检查浏览器存储权限后重试。" };
  }
}

export function adminGovernanceHasContent(data: AdminGovernanceData): boolean {
  return Boolean(
    data.operations.length ||
      data.claims.length ||
      data.gisItems.length ||
      data.narrations.length ||
      data.corrections.length ||
      data.auditLogs.length,
  );
}

export function exportAdminGovernanceJson(data: AdminGovernanceData): string {
  return JSON.stringify(
    {
      exportType: "六祖云游运营治理本机原型",
      warning: "此文件来自本地演示后台，不代表官方发布记录，也不能替代生产审计存档。",
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  );
}

export function createDemoAdminGovernanceData(): AdminGovernanceData {
  const now = new Date();
  const at = now.toISOString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const date = (value: Date) => value.toISOString().slice(0, 10);

  const operationId = createAdminId("operation");
  const claimId = createAdminId("claim");
  const gisId = createAdminId("gis");
  const narrationId = createAdminId("narration");
  const correctionId = createAdminId("correction");
  const demoSource = "原型演示来源（非官方事实，不可用于正式发布）";

  return {
    version: 1,
    operations: [
      {
        id: operationId,
        kind: "OPERATION",
        subject: "演示服务点状态",
        value: "待重新核验",
        source: demoSource,
        owner: "演示运营岗",
        validFrom: date(yesterday),
        validUntil: date(yesterday),
        state: "DRAFT",
        revision: 1,
        lastEditedBy: "演示运营岗",
        reviewDecision: null,
        publication: null,
        withdrawal: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
    claims: [
      {
        id: claimId,
        kind: "KNOWLEDGE",
        claim: "演示命题：此句只用于验证审核流程，不代表真实文化事实",
        factType: "INTERPRETATION",
        evidence: "原型占位证据；正式使用前必须替换为可核验的一手来源。",
        source: demoSource,
        owner: "演示内容编辑",
        validUntil: date(nextMonth),
        state: "DRAFT",
        revision: 1,
        lastEditedBy: "演示内容编辑",
        reviewDecision: null,
        publication: null,
        withdrawal: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
    gisItems: [
      {
        id: gisId,
        kind: "GIS",
        name: "演示设施点 A",
        objectType: "FACILITY",
        coordinateSystem: "待核验",
        evidence: "仅为界面流程占位，不含真实坐标。",
        source: demoSource,
        owner: "演示 GIS 编辑",
        validUntil: date(nextMonth),
        state: "DRAFT",
        revision: 1,
        lastEditedBy: "演示 GIS 编辑",
        reviewDecision: null,
        publication: null,
        withdrawal: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
    narrations: [
      {
        id: narrationId,
        kind: "NARRATION",
        title: "演示讲解资产 A",
        placeName: "演示地点",
        scriptVersion: "demo-0.1",
        evidence: "原型占位材料，未进行内容与权利核验。",
        source: demoSource,
        owner: "演示讲解编辑",
        rightsStatus: "PENDING",
        validUntil: date(nextMonth),
        state: "DRAFT",
        revision: 1,
        lastEditedBy: "演示讲解编辑",
        reviewDecision: null,
        publication: null,
        withdrawal: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
    corrections: [
      {
        id: correctionId,
        subject: "演示纠错：页面信息需要重新核验",
        detail: "这是一条用于测试分派与关闭流程的占位纠错，不对应真实页面问题。",
        category: "CONTENT",
        priority: "MEDIUM",
        state: "RECEIVED",
        reporterAlias: "演示游客",
        owner: "",
        resolution: "",
        createdAt: at,
        updatedAt: at,
      },
    ],
    auditLogs: [
      createAuditLog({
        entityKind: "SYSTEM",
        entityId: "demo-seed",
        entityName: "原型演示数据",
        action: "DEMO_LOADED",
        actorName: "本机原型",
        actorRole: "SYSTEM",
        fromState: null,
        toState: "LOADED",
        note: "全部条目均为流程占位，不构成景区事实或正式发布记录。",
        at,
      }),
    ],
    updatedAt: at,
  };
}
