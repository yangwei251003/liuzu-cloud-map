import type { PortalRole } from "./types";

export interface PermissionCheck {
  canViewAllSubmissions: boolean;
  canReviewSubmissions: boolean;
  canEditLocation: boolean;
  canPublishContent: boolean;
  canSubmitContent: boolean;
  canEditOwnDrafts: boolean;
  canViewUnpublished: boolean;
  canManageFeatured: boolean;
}

export function getRolePermissions(role: PortalRole): PermissionCheck {
  switch (role) {
    case "studio":
      return {
        canViewAllSubmissions: true,
        canReviewSubmissions: true,
        canEditLocation: true,
        canPublishContent: true,
        canSubmitContent: true,
        canEditOwnDrafts: true,
        canViewUnpublished: true,
        canManageFeatured: true,
      };
    case "partner":
      return {
        canViewAllSubmissions: false,
        canReviewSubmissions: false,
        canEditLocation: true, // 在提交表单时可选点
        canPublishContent: false, // 商户绝不可自行发布
        canSubmitContent: true,
        canEditOwnDrafts: true,
        canViewUnpublished: true, // 仅自己组织的未发布资源
        canManageFeatured: false,
      };
    case "visitor":
    default:
      return {
        canViewAllSubmissions: false,
        canReviewSubmissions: false,
        canEditLocation: false,
        canPublishContent: false,
        canSubmitContent: false,
        canEditOwnDrafts: false,
        canViewUnpublished: false,
        canManageFeatured: false,
      };
  }
}

export function canAccessRoute(pathname: string, role: PortalRole): boolean {
  if (pathname.startsWith("/studio")) {
    return role === "studio";
  }
  if (pathname.startsWith("/partner/workbench") || pathname.startsWith("/partner/resources") || pathname.startsWith("/partner/activities")) {
    return role === "partner" || role === "studio";
  }
  return true;
}
