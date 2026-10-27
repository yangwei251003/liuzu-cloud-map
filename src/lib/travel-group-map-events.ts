export const TRAVEL_GROUP_MAP_MEMBERS_EVENT = "liuzu-cloud-tour:travel-group-map-members";

export type TravelGroupMapMember = {
  accountId: string;
  displayName: string;
  longitude: number;
  latitude: number;
  distanceMeters: number;
  direction: string;
};

export function parseTravelGroupMapMembers(value: unknown): TravelGroupMapMember[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const members: TravelGroupMapMember[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const member = item as Record<string, unknown>;
    if (
      typeof member.accountId !== "string"
      || !member.accountId.trim()
      || typeof member.displayName !== "string"
      || !member.displayName.trim()
      || member.displayName.length > 80
      || typeof member.longitude !== "number"
      || !Number.isFinite(member.longitude)
      || member.longitude < -180
      || member.longitude > 180
      || typeof member.latitude !== "number"
      || !Number.isFinite(member.latitude)
      || member.latitude < -90
      || member.latitude > 90
      || typeof member.distanceMeters !== "number"
      || !Number.isFinite(member.distanceMeters)
      || member.distanceMeters < 0
      || member.distanceMeters > 100_000
      || typeof member.direction !== "string"
      || member.direction.length > 20
    ) return null;
    members.push(member as TravelGroupMapMember);
  }
  return members;
}

export function publishTravelGroupMapMembers(value: TravelGroupMapMember[]) {
  if (typeof window === "undefined") return;
  const members = parseTravelGroupMapMembers(value);
  if (!members) return;
  window.dispatchEvent(new CustomEvent(TRAVEL_GROUP_MAP_MEMBERS_EVENT, { detail: members }));
}

export function readTravelGroupMapMembersEvent(event: Event): TravelGroupMapMember[] | null {
  if (!(event instanceof CustomEvent) || event.type !== TRAVEL_GROUP_MAP_MEMBERS_EVENT) return null;
  return parseTravelGroupMapMembers(event.detail);
}
