export type ExtractionConfidence = "EXPLICIT" | "ALIAS" | "FUZZY";

export type ExtractedItineraryStop = {
  id: string;
  name: string;
  evidence: string;
  start: number;
  end: number;
  dwellMinutes: number | null;
  confidence: ExtractionConfidence;
  eligibleForRoute: boolean;
  reviewNote: string;
};

export type UnrecognizedFragment = {
  text: string;
  start: number;
  end: number;
  reason: "UNKNOWN_PLACE_OR_ACTIVITY";
};

export type UnresolvedIssueType = "DWELL_TIME" | "TIME_WINDOW" | "ACTION_CONSTRAINT" | "UNKNOWN_FRAGMENT";

export type UnresolvedResolution = {
  method: "VALUE_PROVIDED" | "EXPLICITLY_IGNORED";
  value: string;
  reason: string;
  resolvedAt: string;
};

export type UnresolvedIssue = {
  id: string;
  type: UnresolvedIssueType;
  evidence: string;
  message: string;
  stopId: string | null;
  start: number;
  end: number;
  blocking: true;
  status: "UNRESOLVED" | "RESOLVED" | "IGNORED";
  resolution: UnresolvedResolution | null;
};

export type ItineraryCandidateOption = {
  id: string;
  name: string;
  confidence: "FUZZY";
  eligibleForRoute: boolean;
  reviewNote: string;
};

export type ItineraryAmbiguity = {
  id: string;
  evidence: string;
  start: number;
  end: number;
  reason: string;
  status: "UNRESOLVED";
  candidates: ItineraryCandidateOption[];
};

export type ItineraryExtraction = {
  requestId: string;
  mode: "MODEL_GROUNDED" | "LOCAL_RULES";
  status: "REVIEW_REQUIRED";
  stops: ExtractedItineraryStop[];
  ambiguities: ItineraryAmbiguity[];
  unrecognizedFragments: UnrecognizedFragment[];
  unresolved: UnresolvedIssue[];
  warnings: string[];
};

export type ItineraryExtractionError = {
  requestId: string;
  error: {
    code: "INVALID_REQUEST" | "RATE_LIMITED" | "SERVER_ERROR";
    message: string;
    retryable: boolean;
  };
};
