import { getSocialUploadPolicy } from "@/lib/server/social-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return getSocialUploadPolicy();
}
