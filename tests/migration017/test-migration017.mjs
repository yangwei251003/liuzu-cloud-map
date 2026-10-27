import { PGlite } from '@electric-sql/pglite';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(option('--project', fileURLToPath(new URL('../../', import.meta.url))));
const filename = '017_route_operational_release_legacy_count_check.sql';
const upPath = path.resolve(option('--migration', path.join(root, 'database/migrations', filename)));
const downPath = path.resolve(option('--rollback', path.join(root, 'database/rollbacks', filename)));
globalThis.fetch = async () => { throw new Error('Network disabled: this regression uses in-memory PostgreSQL only'); };
const db = new PGlite();
const results = [];
const up = await readFile(upPath, 'utf8'), down = await readFile(downPath, 'utf8');
const source13 = await readFile(path.join(root, 'database/migrations/013_route_operational_snapshot_release.sql'), 'utf8');
const source16 = await readFile(path.join(root, 'database/migrations/016_route_operational_observations.sql'), 'utf8');
const rollback16 = await readFile(path.join(root, 'database/rollbacks/016_route_operational_observations.sql'), 'utf8');
const create = source13.slice(source13.indexOf('CREATE TABLE IF NOT EXISTS route_operational_snapshot_releases'), source13.indexOf('CREATE INDEX IF NOT EXISTS route_operational_snapshot_releases_queue_idx'));
const alter16 = source16.slice(source16.indexOf('ALTER TABLE route_operational_snapshot_releases'), source16.indexOf('CREATE TABLE IF NOT EXISTS route_operational_snapshot_release_observations'));
const down16 = rollback16.slice(rollback16.indexOf('ALTER TABLE route_operational_snapshot_releases'), rollback16.indexOf('DROP TRIGGER IF EXISTS route_operational_observations_transition_guard'));
assert.ok(create.length > 1000 && alter16.includes('confirmed_observation_count') && down16.includes('ADD CONSTRAINT'));
const oldName = 'route_operational_snapshot_releases_check2';
const ownName = 'route_operational_releases_legacy_count_017_ck';
const evidence = ['route_operational_snapshot_release_events', 'route_operational_snapshot_release_observations',
  'route_operational_snapshot_release_actions', 'route_operational_observations', 'route_operational_observation_actions'];
let serial = 2;
async function tx(sql) {
  await db.exec('BEGIN');
  try { await db.exec(sql); await db.exec('COMMIT'); }
  catch (error) { await db.exec('ROLLBACK'); throw error; }
}
async function setup() {
  serial = 2;
  await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    CREATE TABLE scenic_areas (id text PRIMARY KEY);
    CREATE TABLE scenic_published_snapshots (id uuid PRIMARY KEY);
    CREATE TABLE route_network_revisions (scenic_area_id text, id uuid, PRIMARY KEY(scenic_area_id,id));
    CREATE TABLE route_operational_versions (id uuid PRIMARY KEY);
    INSERT INTO scenic_areas VALUES ('synthetic-ci');
    INSERT INTO scenic_published_snapshots VALUES ('00000000-0000-4000-8000-000000000001');
    INSERT INTO route_network_revisions VALUES ('synthetic-ci','00000000-0000-4000-8000-000000000002');`);
  await db.exec(create); await db.exec(alter16);
  for (const table of evidence) await db.exec(`CREATE TABLE ${table} (id integer PRIMARY KEY)`);
}
async function constraints() {
  return (await db.query(`SELECT conname, pg_get_expr(conbin,conrelid) AS expression, convalidated
    FROM pg_constraint WHERE conrelid='route_operational_snapshot_releases'::regclass AND contype='c' ORDER BY conname`)).rows;
}
async function insertRelease(events, observations, edges) {
  const version = randomUUID();
  await db.query('INSERT INTO route_operational_versions VALUES ($1)', [version]);
  return db.query(`INSERT INTO route_operational_snapshot_releases (
    scenic_area_id,base_snapshot_id,network_revision_id,operational_version_id,
    base_snapshot_revision,target_snapshot_revision,base_operational_version,target_operational_version,
    workflow_revision,lifecycle_state,source_reference,reason_summary,snapshot_json,snapshot_sha256,
    confirmed_event_count,confirmed_observation_count,affected_edge_count,prepared_by_subject,prepared_at,expires_at
  ) VALUES ('synthetic-ci','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',$1,
    1,$2,1,2,1,'PREPARED','https://evidence.example.test/isolated','Fictional isolated count regression.','{}',$3,
    $4,$5,$6,'synthetic-preparer','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')`,
    [version, serial++, '0'.repeat(64), events, observations, edges]);
}
async function rejected(action, code, constraint) {
  await assert.rejects(action, error => {
    assert.equal(error.code, code);
    if (constraint) {
      if (Array.isArray(constraint)) assert.ok(constraint.includes(error.constraint));
      else assert.equal(error.constraint, constraint);
    }
    return true;
  });
}
async function test(name, action) {
  await action(); results.push({name, passed:true}); console.log('PASS ' + name);
}
try {
  await setup();
  await test('original 013 plus 016 reproduces actual unnamed-check failure', async () => {
    await rejected(() => insertRelease(0, 1, 1), '23514', oldName);
  });
  await test('017 removes only the exact old predicate and retains custom policy', async () => {
    await db.exec('ALTER TABLE route_operational_snapshot_releases ADD CONSTRAINT custom_revision_limit CHECK (target_snapshot_revision < 100000)');
    const before = await constraints(); await tx(up);
    assert.deepEqual(await constraints(), before.filter(x => x.conname !== oldName));
  });
  await test('already repaired 017 replay is an exact no-op', async () => {
    const before = await constraints(); await tx(up); assert.deepEqual(await constraints(), before);
  });
  await test('observation-only source is accepted', () => insertRelease(0, 1, 1));
  await test('event-only source is accepted', () => insertRelease(1, 0, 1));
  await test('negative count remains rejected', () => rejected(() => insertRelease(-1, 2, 1), '23514', 'route_operational_releases_source_count_ck'));
  await test('no reviewed source remains rejected', () => rejected(() => insertRelease(0, 0, 1), '23514', ['route_operational_releases_source_count_ck', 'route_operational_releases_affected_edge_count_ck']));
  await test('too many affected edges remain rejected', () => rejected(() => insertRelease(0, 1, 2), '23514', 'route_operational_releases_affected_edge_count_ck'));
  await test('nonempty release rollback refuses and retains rows and checks', async () => {
    const before = await constraints(); await rejected(() => tx(down), 'P0001');
    assert.deepEqual(await constraints(), before);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM route_operational_snapshot_releases')).rows[0].count, 2);
  });
  for (const table of evidence) {
    await test('rollback retains evidence in ' + table, async () => {
      await setup(); await tx(up); await db.exec(`INSERT INTO ${table} VALUES (1)`);
      const before = await constraints(); await rejected(() => tx(down), 'P0001');
      assert.deepEqual(await constraints(), before);
      assert.equal((await db.query(`SELECT count(*)::integer AS count FROM ${table}`)).rows[0].count, 1);
    });
  }
  await test('empty 017 down then original 016 down/up then 017 up has no name collision', async () => {
    await setup(); await tx(up); await tx(down);
    assert.ok((await constraints()).some(x => x.conname === ownName));
    await rejected(() => insertRelease(0, 1, 1), '23514', ownName);
    await tx(down16); await tx(alter16); await tx(up);
    await insertRelease(0, 1, 1);
  });
  for (const [name, mutation] of [
    ['custom equivalent name', `ALTER TABLE route_operational_snapshot_releases RENAME CONSTRAINT ${oldName} TO custom_legacy_policy`],
    ['duplicate equivalent rule', 'ALTER TABLE route_operational_snapshot_releases ADD CONSTRAINT custom_duplicate CHECK (affected_edge_count > 0 AND affected_edge_count <= confirmed_event_count)'],
    ['missing 016 guard', 'ALTER TABLE route_operational_snapshot_releases DROP CONSTRAINT route_operational_releases_source_count_ck'],
    ['unknown old-name shape', `ALTER TABLE route_operational_snapshot_releases DROP CONSTRAINT ${oldName}; ALTER TABLE route_operational_snapshot_releases ADD CONSTRAINT ${oldName} CHECK (affected_edge_count >= confirmed_event_count)`],
    ['unvalidated old rule', `ALTER TABLE route_operational_snapshot_releases DROP CONSTRAINT ${oldName}; ALTER TABLE route_operational_snapshot_releases ADD CONSTRAINT ${oldName} CHECK (affected_edge_count > 0 AND affected_edge_count <= confirmed_event_count) NOT VALID`],
  ]) {
    await test('017 refuses ' + name + ' without changing checks', async () => {
      await setup(); await db.exec(mutation); const before = await constraints();
      await rejected(() => tx(up), 'P0001'); assert.deepEqual(await constraints(), before);
    });
  }
  const report = {checked_at:new Date().toISOString(),engine:(await db.query('SELECT version()')).rows[0].version,
    package:'@electric-sql/pglite@0.5.12',network_disabled:true,real_service_connections:0,
    hashes:Object.fromEntries([['013_create',create],['016_count_alter',alter16],['016_count_rollback',down16],['017_migration',up],['017_rollback',down]].map(([k,v]) => [k,createHash('sha256').update(v).digest('hex')])),
    passed:results.length,results,
    limitations:['In-memory PostgreSQL count-rule regression with synthetic FK/evidence tables.',
      'Does not execute full GIS geometry, product services or PostGIS16 CI.']};
  if (args.includes('--report')) await writeFile(option('--report'), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:results.length,network_disabled:true,full_postgis_ci_verified:false}));
} finally { await db.close(); }
