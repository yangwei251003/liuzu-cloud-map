-- Conservative rollback: never rewrite/delete evidence to make an old rule fit.
-- Keep the 016 source/observation replacement checks and columns untouched.
-- The existing migration runner must wrap this entire file in one transaction.
DO $rollback_017$
DECLARE
  target_oid oid;
  target_schema text;
  target_sql text;
  evidence_name text;
  evidence_oid oid;
  has_evidence boolean;
  legacy_count integer;
  legacy_name text;
  evidence_tables CONSTANT text[] := ARRAY[
    'route_operational_snapshot_releases',
    'route_operational_snapshot_release_events',
    'route_operational_snapshot_release_observations',
    'route_operational_snapshot_release_actions',
    'route_operational_observations',
    'route_operational_observation_actions'
  ];
  old_expr CONSTANT text :=
    '((affected_edge_count > 0) AND (affected_edge_count <= confirmed_event_count))';
BEGIN
  SELECT rel.oid, ns.nspname, format('%I.%I', ns.nspname, rel.relname)
    INTO target_oid, target_schema, target_sql
  FROM pg_class AS rel
  JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace
  WHERE rel.oid = to_regclass('route_operational_snapshot_releases')
    AND rel.relkind = 'r' AND NOT rel.relispartition
    AND ns.nspname = current_schema();
  IF target_oid IS NULL THEN
    RAISE EXCEPTION 'Rollback 017 refuses unexpected or missing release-table schema';
  END IF;
  EXECUTE format('LOCK TABLE %s IN ACCESS EXCLUSIVE MODE', target_sql);

  -- SHARE locks prevent inserts after the evidence check until transaction end.
  -- Reject all relevant evidence, even if some existing rows satisfy the old rule.
  FOREACH evidence_name IN ARRAY evidence_tables LOOP
    evidence_oid := to_regclass(format('%I.%I', target_schema, evidence_name));
    IF evidence_oid IS NULL THEN
      RAISE EXCEPTION 'Rollback 017 requires every existing 016 evidence table';
    END IF;
    EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE', target_schema, evidence_name);
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1)', target_schema, evidence_name)
      INTO has_evidence;
    IF has_evidence THEN
      RAISE EXCEPTION 'Rollback 017 refused: operational evidence must be retained';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_attribute
      WHERE attrelid = target_oid AND attnum > 0 AND NOT attisdropped
        AND attname IN ('affected_edge_count', 'confirmed_event_count', 'confirmed_observation_count')
        AND atttypid = 'pg_catalog.int4'::regtype) <> 3 THEN
    RAISE EXCEPTION 'Rollback 017 requires the original 016 integer count columns';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = target_oid AND c.contype = 'c' AND c.convalidated
      AND c.conname = 'route_operational_releases_source_count_ck'
      AND pg_get_expr(c.conbin, c.conrelid, false) =
        '((confirmed_event_count >= 0) AND (confirmed_observation_count >= 0) AND ((confirmed_event_count + confirmed_observation_count) > 0))'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint AS c
    WHERE c.conrelid = target_oid AND c.contype = 'c' AND c.convalidated
      AND c.conname = 'route_operational_releases_affected_edge_count_ck'
      AND pg_get_expr(c.conbin, c.conrelid, false) =
        '((affected_edge_count > 0) AND (affected_edge_count <= (confirmed_event_count + confirmed_observation_count)))'
  ) THEN
    RAISE EXCEPTION 'Rollback 017 requires exact validated 016 replacement checks';
  END IF;

  SELECT count(*), min(c.conname::text) INTO legacy_count, legacy_name
  FROM pg_constraint AS c
  WHERE c.conrelid = target_oid AND c.contype = 'c'
    AND pg_get_expr(c.conbin, c.conrelid, false) = old_expr;
  IF legacy_count > 1 THEN
    RAISE EXCEPTION 'Rollback 017 refuses ambiguous legacy-equivalent constraints';
  END IF;
  IF legacy_count = 1 THEN
    IF legacy_name ~ '^route_operational_snapshot_releases_check([1-9][0-9]*)?$'
      OR legacy_name IN ('route_operational_snapshot_releases_affected_edge_count_check',
                         'route_operational_releases_legacy_count_017_ck') THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Rollback 017 refuses a custom-named legacy-equivalent constraint';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = target_oid
      AND conname = 'route_operational_releases_legacy_count_017_ck'
  ) THEN
    RAISE EXCEPTION 'Rollback 017 refuses a legacy-name collision with another constraint';
  END IF;

  -- Use a 017-only name: rollback016 itself ADDs the older explicit name.
  -- Reusing rollback016's name would break the 017 -> 016 -> 0 down chain.
  -- Forward017 recognizes this exact name/predicate on a later re-upgrade.
  -- Never restore the removed event_count>0 rule: 017 did not remove that rule.
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I CHECK (affected_edge_count > 0 AND affected_edge_count <= confirmed_event_count)',
    target_sql, 'route_operational_releases_legacy_count_017_ck'
  );
END;
$rollback_017$;
