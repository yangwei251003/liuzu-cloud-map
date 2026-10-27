import { getSocialCapabilityStatus } from "@/lib/server/social-api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return getSocialCapabilityStatus();
}
