export type HeroConnectionProfile = {
  saveData?: boolean;
  effectiveType?: string;
};

export type HeroMediaDecision = {
  playVideo: boolean;
  reason: "video" | "reduced-motion" | "save-data" | "slow-network" | "hidden-document";
};

export type HeroPlaybackPreference = "auto" | "play" | "pause";

export function resolveHeroPlayback({
  decision,
  preference,
  playbackFailed = false,
}: {
  decision: HeroMediaDecision;
  preference: HeroPlaybackPreference;
  playbackFailed?: boolean;
}) {
  if (playbackFailed || preference === "pause") return false;
  if (preference === "play") return true;
  return decision.playVideo;
}

export function decideHeroMedia({
  reducedMotion,
  connection,
  documentHidden = false,
}: {
  reducedMotion: boolean;
  connection?: HeroConnectionProfile | null;
  documentHidden?: boolean;
}): HeroMediaDecision {
  if (reducedMotion) return { playVideo: false, reason: "reduced-motion" };
  if (connection?.saveData) return { playVideo: false, reason: "save-data" };
  if (["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) {
    return { playVideo: false, reason: "slow-network" };
  }
  if (documentHidden) return { playVideo: false, reason: "hidden-document" };
  return { playVideo: true, reason: "video" };
}
