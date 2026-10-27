import type { PublishedPoiCatalogRepository } from "../p0-itinerary-extraction/types";

/**
 * The production catalog publisher has not been wired to a real database yet.
 * This adapter is intentionally unavailable rather than reading prototype,
 * candidate, map-provider, or fixture POIs. A future reviewed repository can
 * replace it without changing the closed HTTP or matching contracts.
 */
export const unavailablePublishedPoiCatalogRepository: PublishedPoiCatalogRepository = {
  async readCurrentPublishedPoiCatalog() {
    return null;
  },
};
