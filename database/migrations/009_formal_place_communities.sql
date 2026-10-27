-- A public place community is a social view of one currently published POI,
-- not an independently invented coordinate or place name. Existing rows are
-- intentionally not backfilled: operators must review and bind them first.

CREATE UNIQUE INDEX IF NOT EXISTS published_pois_community_binding_uq
  ON published_pois (scenic_area_id, id, canonical_code);

ALTER TABLE place_communities
  ADD COLUMN IF NOT EXISTS published_poi_id uuid;

ALTER TABLE place_communities
  ADD CONSTRAINT place_communities_published_poi_fk
    FOREIGN KEY (scenic_area_id, published_poi_id, place_id)
    REFERENCES published_pois (scenic_area_id, id, canonical_code)
    ON DELETE RESTRICT
    NOT VALID,
  ADD CONSTRAINT place_communities_published_binding_ck CHECK (
    lifecycle_state <> 'PUBLISHED'
    OR (
      published_poi_id IS NOT NULL
      AND verification_state = 'VERIFIED'
      AND verified_at IS NOT NULL
      AND valid_until IS NOT NULL
    )
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS place_communities_published_poi_uq
  ON place_communities (scenic_area_id, published_poi_id)
  WHERE published_poi_id IS NOT NULL;

COMMENT ON COLUMN place_communities.published_poi_id IS
  'Reviewed one-to-one binding to published_pois. Public APIs must also verify the POI and its publication are current.';
