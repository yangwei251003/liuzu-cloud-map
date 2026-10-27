DROP INDEX IF EXISTS place_communities_published_poi_uq;

ALTER TABLE place_communities
  DROP CONSTRAINT IF EXISTS place_communities_published_binding_ck,
  DROP CONSTRAINT IF EXISTS place_communities_published_poi_fk,
  DROP COLUMN IF EXISTS published_poi_id;

DROP INDEX IF EXISTS published_pois_community_binding_uq;
