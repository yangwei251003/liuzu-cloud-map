import type { ContentStatus, PortalRole } from "./types";

export interface StatusTransition {
  from: ContentStatus;
  to: ContentStatus;
  action: string;
  allowedRole: PortalRole;
  requiresNote?: boolean;
}

export const VALID_TRANSITIONS: StatusTransition[] = [
  // 商户操作
  { from: "draft", to: "pending_review", action: "submit", allowedRole: "partner" },
  { from: "changes_requested", to: "pending_review", action: "resubmit", allowedRole: "partner" },
  
  // 管理端审核操作
  { from: "pending_review", to: "approved", action: "approve", allowedRole: "studio" },
  { from: "pending_review", to: "changes_requested", action: "request_changes", allowedRole: "studio", requiresNote: true },
  { from: "pending_review", to: "rejected", action: "reject", allowedRole: "studio", requiresNote: true },
  
  // 管理端发布操作
  { from: "approved", to: "published", action: "publish", allowedRole: "studio" },
  { from: "pending_review", to: "published", action: "approve_and_publish", allowedRole: "studio" },
  { from: "published", to: "unpublished", action: "unpublish", allowedRole: "studio", requiresNote: true },
  { from: "unpublished", to: "published", action: "republish", allowedRole: "studio" },
];

export function canTransition(
  currentStatus: ContentStatus,
  targetStatus: ContentStatus,
  role: PortalRole
): boolean {
  return VALID_TRANSITIONS.some(
    (t) => t.from === currentStatus && t.to === targetStatus && t.allowedRole === role
  );
}

export function getStatusBadge(status: ContentStatus): {
  label: string;
  variant: "default" | "warning" | "success" | "danger" | "muted";
  colorClass: string;
} {
  switch (status) {
    case "draft":
      return { label: "草稿", variant: "muted", colorClass: "bg-stone-100 text-stone-700 border-stone-300" };
    case "pending_review":
      return { label: "待审核", variant: "warning", colorClass: "bg-amber-50 text-amber-800 border-amber-300" };
    case "changes_requested":
      return { label: "需修改", variant: "danger", colorClass: "bg-rose-50 text-rose-800 border-rose-300" };
    case "approved":
      return { label: "已通过", variant: "success", colorClass: "bg-emerald-50 text-emerald-800 border-emerald-300" };
    case "published":
      return { label: "已发布", variant: "success", colorClass: "bg-emerald-100 text-emerald-900 border-emerald-400 font-semibold" };
    case "rejected":
      return { label: "已拒绝", variant: "danger", colorClass: "bg-red-100 text-red-800 border-red-300" };
    case "unpublished":
      return { label: "已下架", variant: "muted", colorClass: "bg-gray-100 text-gray-600 border-gray-300" };
    default:
      return { label: "未知", variant: "muted", colorClass: "bg-gray-100 text-gray-600 border-gray-300" };
  }
}
