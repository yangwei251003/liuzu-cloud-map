import "server-only";

import { isDatabaseConfigured } from "./database";
import type { FormalOfflinePackHttpDependencies } from "./formal-offline-pack-http";
import { postgresFormalOfflinePackRepository } from "./formal-offline-pack-repository";

export const productionFormalOfflinePackDependencies: FormalOfflinePackHttpDependencies = {
  repository: postgresFormalOfflinePackRepository,
  isAvailable() {
    return isDatabaseConfigured() && process.env.FORMAL_OFFLINE_PACK_ENABLED === "1";
  },
};
