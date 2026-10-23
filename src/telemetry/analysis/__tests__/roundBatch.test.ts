import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkRoundFiles } from '../roundBatch.ts';
import { fixture } from './fixtures.ts';

const cliPath = fileURLToPath(new URL('../cli.ts', import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', cliPath, ...args], { encoding: 'utf8', timeout: 30000 });
function temp(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'adaptiveaim validation '));
  const files: string[] = [];
  const dirs: string[] = [];
  t.after(() => {
    for (const file of files) unlinkSync(file);
    for (const folder of dirs.reverse()) rmdirSync(folder);
    rmdirSync(dir);
  });
  return {
    dir,
    folder: (name: string) => { const folder = join(dir, name); mkdirSync(folder); dirs.push(folder); return folder; },
    write: (name: string, value: unknown) => {
      const file = join(dir, name);
      writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
      files.push(file);
      return file;
    },
  };
}
function identified(id: string, mode = 'six_shot', hits = 2, miss = true) {
  const data = fixture(mode, hits, miss);
  data.round.round_id = id;
  for (const event of [...data.targets, ...data.shots, ...data.trajectory_segments]) event.round_id = id;
  return data;
}

describe('local telemetry batches and CLI', () => {
  it('pools by shot/hit counts and keeps modes separate', t => {
    const fs = temp(t);
    fs.write('a.json', identified('a', 'six_shot', 1));
    fs.write('b.json', identified('b', 'six_shot', 3));
    fs.write('c.json', identified('c', 'moving_targets'));
    fs.write('d.json', identified('d', 'six_shot', 0, false));
    const result = checkRoundFiles([fs.dir]);
    assert.equal(result.valid, true, JSON.stringify(result.files));
    assert.equal(result.modes.length, 2);
    const six = result.modes.find(m => m.mode === 'six_shot')!;
    assert.equal(six.rounds, 3);
    assert.equal(six.hits, 4);
    assert.equal(six.shots, 6);
    assert.equal(six.accuracyPercent, 100 * 4 / 6);
    assert.equal(six.meanReactionSeconds, 1.75);
    assert.equal(six.meanPrecisionPixels, 5);
  });

  it('rejects all copies of a duplicate round independent of input order', t => {
    const fs = temp(t);
    const a = fs.write('a.json', fixture());
    const b = fs.write('b.json', fixture());
    for (const inputs of [[a, b], [b, a]]) {
      const result = checkRoundFiles(inputs);
      assert.equal(result.valid, false);
      assert.equal(result.files.length, 2);
      assert.equal(result.modes.length, 0);
      for (const file of result.files) assert.ok(file.issues.some(i => i.code === 'duplicate_round'));
    }
  });

  it('deduplicates equivalent paths without reporting a duplicate round', t => {
    const fs = temp(t);
    const a = fs.write('round with spaces.json', fixture());
    const result = checkRoundFiles([a, a, fs.dir]);
    assert.equal(result.valid, true);
    assert.equal(result.files.length, 1);
    assert.equal(result.modes[0].rounds, 1);
  });

  it('excludes the valid copy too when another copy of the round is damaged', t => {
    const fs = temp(t);
    const damaged = fixture();
    damaged.round.hits++;
    fs.write('valid.json', fixture());
    fs.write('damaged.json', damaged);
    const result = checkRoundFiles([fs.dir]);
    assert.equal(result.valid, false);
    assert.equal(result.modes.length, 0);
    assert.ok(result.files.every(file => file.issues.some(i => i.code === 'duplicate_round')));
  });

  it('continues after bad JSON, invalid records and missing files', t => {
    const fs = temp(t);
    fs.write('good.json', fixture());
    fs.write('bad.json', '{ invalid JSON');
    fs.write('shape.json', { round: null });
    const result = checkRoundFiles([fs.dir, join(fs.dir, 'absent.json')]);
    assert.equal(result.valid, false);
    assert.equal(result.modes[0].rounds, 1);
    assert.deepEqual(result.files.filter(f => !f.valid).map(f => f.issues[0].code).sort(), ['json', 'read', 'shape']);
  });

  it('does not recurse into folders or silently pass an empty folder', t => {
    const fs = temp(t);
    const nested = fs.folder('nested');
    fs.write('nested/only.json', fixture());
    fs.write('notes.txt', 'not a capture');
    const result = checkRoundFiles([fs.dir]);
    assert.equal(result.valid, false);
    assert.equal(result.files[0].issues[0].code, 'empty_folder');
    assert.equal(checkRoundFiles([nested]).valid, true);
    assert.equal(checkRoundFiles([]).valid, false);
  });

  it('returns null means for a batch without hits', t => {
    const fs = temp(t);
    fs.write('empty.json', fixture('six_shot', 0, false));
    const mode = checkRoundFiles([fs.dir]).modes[0];
    assert.equal(mode.accuracyPercent, null);
    assert.equal(mode.meanReactionSeconds, null);
    assert.equal(mode.meanPrecisionPixels, null);
  });

  it('prints parseable JSON, supports paths with spaces, and exits zero for warnings', t => {
    const fs = temp(t);
    const file = fs.write('early thirty shot.json', fixture('thirty_shot'));
    const result = run('--json', file);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.valid, true);
    assert.equal(report.files[0].summary.completion, 'below_goal');
    assert.equal(report.files[0].issues[0].severity, 'warning');
    assert.equal(report.modes[0].roundsWithWarnings, 1);
  });

  it('uses exit one for data errors and shows failures in human output', t => {
    const fs = temp(t);
    const file = fs.write('bad.json', 'null');
    const result = run(file);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /FAIL/);
    assert.match(result.stdout, /ERROR shape/);
    assert.match(result.stdout, /Validation failed/);
  });

  it('documents usage and handles missing inputs or unknown flags', () => {
    const help = run('--help');
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Exit codes/);
    for (const args of [[], ['--json'], ['--typo', 'file.json']]) {
      const result = run(...args);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /Usage/);
    }
  });
});
