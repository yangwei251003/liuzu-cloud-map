-- Forward-only repair. Run through the existing transactional migration runner.
-- Existing 001-016 migration bytes/checksums must remain unchanged.
-- No application rows are read, rewritten or deleted by this migration.
DO $migration_017$
DECLARE
  target_oid oid;
  target_schema text;
  target_sql text;
  legacy_key smallint[];
  source_key smallint[];
  modern_affected_key smallint[];
  legacy_count integer;
  legacy_name text;
  valid_metadata boolean;
  old_expr CONSTANT text :=
    '((affected_edge_count > 0) AND (affected_edge_count <= confirmed_event_count))';
  source_expr CONSTANT text :=
    '((confirmed_event_count >= 0) AND (confirmed_observation_count >= 0) AND ((confirmed_event_count + confirmed_observation_count) > 0))';
  modern_affected_expr CONSTANT text :=
    '((affected_edge_count > 0) AND (affected_edge_count <= (confirmed_event_count + confirmed_observation_count)))';
BEGIN
  SELECT rel.oid, ns.nspname, format('%I.%I', ns.nspname, rel.relname)
    INTO target_oid, target_schema, target_sql
  FROM pg_class AS rel
  JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace
  WHERE rel.oid = to_regclass('route_operational_snapshot_releases')
    AND rel.relkind = 'r' AND NOT rel.relispartition
    AND ns.nspname = current_schema();
  IF target_oid IS NULL THEN
    RAISE EXCEPTION 'Migration 017 refuses unexpected or missing release-table schema';
  END IF;
  EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', target_sql);

  IF (SELECT count(*) FROM pg_attribute
      WHERE attrelid = target_oid AND attnum > 0 AND NOT attisdropped
        AND attname IN ('affected_edge_count', 'confirmed_event_count', 'confirmed_observation_count')
        AND atttypid = 'pg_catalog.int4'::regtype) <> 3 THEN
    RAISE EXCEPTION 'Migration 017 requires the three original integer count columns';
  END IF;
  SELECT array_agg(attnum ORDER BY attnum) INTO legacy_key
  FROM pg_attribute WHERE attrelid = target_oid AND NOT attisdropped
    AND attname IN ('affected_edge_count', 'confirmed_event_count');
  SELECT array_agg(attnum ORDER BY attnum) INTO source_key
  FROM pg_attribute WHERE attrelid = target_oid AND NOT attisdropped
    AND attname IN ('confirmed_event_count', 'confirmed_observation_count');
  SELECT array_agg(attnum ORDER BY attnum) INTO modern_affected_key
  FROM pg_attribute WHERE attrelid = target_oid AND NOT attisdropped
    AND attname IN ('affected_edge_count', 'confirmed_event_count', 'confirmed_observation_count');

  -- Keep the 016 replacements intact. A name alone is insufficient proof.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = target_oid AND c.contype = 'c'
      AND c.conname = 'route_operational_releases_source_count_ck'
      AND c.convalidated AND c.conislocal AND c.coninhcount = 0 AND c.conparentid = 0
      AND (SELECT array_agg(a ORDER BY a) FROM unnest(c.conkey) AS key(a)) = source_key
      AND pg_get_expr(c.conbin, c.conrelid, false) = source_expr
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = target_oid AND c.contype = 'c'
      AND c.conname = 'route_operational_releases_affected_edge_count_ck'
      AND c.convalidated AND c.conislocal AND c.coninhcount = 0 AND c.conparentid = 0
      AND (SELECT array_agg(a ORDER BY a) FROM unnest(c.conkey) AS key(a)) = modern_affected_key
      AND pg_get_expr(c.conbin, c.conrelid, false) = modern_affected_expr
  ) THEN
    RAISE EXCEPTION 'Migration 017 requires exact validated 016 replacement checks';
  END IF;

  SELECT count(*), min(c.conname::text) INTO legacy_count, legacy_name
  FROM pg_constraint AS c
  WHERE c.conrelid = target_oid AND c.contype = 'c'
    AND pg_get_expr(c.conbin, c.conrelid, false) = old_expr;
  IF legacy_count > 1 THEN
    RAISE EXCEPTION 'Migration 017 refuses ambiguous duplicate legacy predicates';
  END IF;
  IF legacy_count = 0 THEN
    -- Already repaired is a no-op, but do not silently accept an unknown
    -- expression under the original generated/known legacy-name family.
    IF EXISTS (
      SELECT 1 FROM pg_constraint AS c
      WHERE c.conrelid = target_oid AND c.contype = 'c'
        AND (c.conname ~ '^route_operational_snapshot_releases_check([1-9][0-9]*)?$'
          OR c.conname IN ('route_operational_snapshot_releases_affected_edge_count_check',
                          'route_operational_releases_legacy_count_017_ck'))
        AND (SELECT array_agg(a ORDER BY a) FROM unnest(c.conkey) AS key(a)) = legacy_key
    ) THEN
      RAISE EXCEPTION 'Migration 017 refuses an unrecognized legacy-named predicate';
    END IF;
    RETURN;
  END IF;

  -- Unknown custom names, inheritance, or unusual metadata require review.
  IF NOT (legacy_name ~ '^route_operational_snapshot_releases_check([1-9][0-9]*)?$'
    OR legacy_name IN ('route_operational_snapshot_releases_affected_edge_count_check',
                       'route_operational_releases_legacy_count_017_ck')) THEN
    RAISE EXCEPTION 'Migration 017 refuses a custom-named legacy-equivalent predicate';
  END IF;
  SELECT c.convalidated AND c.conislocal AND c.coninhcount = 0
      AND c.conparentid = 0 AND NOT c.connoinherit
      AND (SELECT array_agg(a ORDER BY a) FROM unnest(c.conkey) AS key(a)) = legacy_key
    INTO valid_metadata
  FROM pg_constraint AS c
  WHERE c.conrelid = target_oid AND c.contype = 'c' AND c.conname = legacy_name;
  IF valid_metadata IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Migration 017 refuses unexpected legacy-constraint metadata';
  END IF;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', target_sql, legacy_name);
END;
$migration_017$;
