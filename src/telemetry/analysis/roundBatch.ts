import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateRoundExport } from './validateRoundExport.ts';
import type { ValidationResult } from './validateRoundExport.ts';

export interface FileResult extends ValidationResult { file: string }
export interface ModeSummary {
  mode: string;
  rounds: number;
  roundsWithWarnings: number;
  goalsReached: number;
  durationSeconds: number;
  shots: number;
  hits: number;
  misses: number;
  accuracyPercent: number | null;
  meanReactionSeconds: number | null;
  meanPrecisionPixels: number | null;
  samples: number;
}

/** Read explicit files or immediate JSON children of folders; never writes telemetry. */
export function checkRoundFiles(inputs: string[]): { valid: boolean; files: FileResult[]; modes: ModeSummary[] } {
  const files: FileResult[] = [];
  const paths = new Set<string>();
  const seenPaths = new Set<string>();
  const byRound = new Map<string, FileResult[]>();
  const failure = (file: string, code: string, message: string): FileResult => ({
    file, valid: false, summary: null, issues: [{ severity: 'error', code, path: '$', message }],
  });
  const addPath = (file: string) => {
    const full = resolve(file);
    // Resolve symlinks and equivalent relative paths before counting a file twice.
    const real = realpathSync(full);
    const key = process.platform === 'win32' ? real.toLowerCase() : real;
    if (!seenPaths.has(key)) { paths.add(full); seenPaths.add(key); }
  };
  for (const input of inputs) {
    const full = resolve(input);
    try {
      if (statSync(full).isDirectory()) {
        const children = readdirSync(full, { withFileTypes: true })
          .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
        if (!children.length) files.push(failure(full, 'empty_folder', 'Folder contains no immediate JSON files.'));
        for (const child of children) addPath(join(full, child.name));
      } else addPath(full);
    } catch (error) { files.push(failure(full, 'read', error instanceof Error ? error.message : String(error))); }
  }
  for (const file of [...paths].sort()) {
    let contents: string;
    try { contents = readFileSync(file, 'utf8'); }
    catch (error) { files.push(failure(file, 'read', error instanceof Error ? error.message : String(error))); continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(contents); }
    catch { files.push(failure(file, 'json', 'File is not valid JSON.')); continue; }
    const result = { file, ...validateRoundExport(parsed) };
    files.push(result);
    // Even a damaged copy must not allow another copy of its round into totals.
    if (parsed !== null && typeof parsed === 'object' && 'round' in parsed) {
      const round = parsed.round;
      if (round !== null && typeof round === 'object' && 'round_id' in round && typeof round.round_id === 'string' && round.round_id.trim()) {
        const group = byRound.get(round.round_id) ?? [];
        group.push(result);
        byRound.set(round.round_id, group);
      }
    }
  }
  for (const duplicates of byRound.values()) {
    if (duplicates.length < 2) continue;
    for (const file of duplicates) {
      file.valid = false;
      file.summary = null;
      file.issues.push({ severity: 'error', code: 'duplicate_round', path: '$.round.round_id', message: 'This round appears in multiple input files; all copies are excluded from totals.' });
    }
  }
  const modes = new Map<string, ModeSummary>();
  for (const file of files) {
    const s = file.summary;
    if (!file.valid || !s) continue;
    const mode = modes.get(s.mode) ?? {
      mode: s.mode, rounds: 0, roundsWithWarnings: 0, goalsReached: 0, durationSeconds: 0, shots: 0, hits: 0, misses: 0,
      accuracyPercent: null, meanReactionSeconds: null, meanPrecisionPixels: null, samples: 0,
    };
    const previousHits = mode.hits;
    mode.rounds++;
    mode.roundsWithWarnings += Number(file.issues.some(i => i.severity === 'warning'));
    mode.goalsReached += Number(s.completion === 'goal_reached');
    mode.durationSeconds += s.durationSeconds;
    mode.shots += s.shots;
    mode.hits += s.hits;
    mode.misses += s.misses;
    mode.samples += s.samples;
    mode.accuracyPercent = mode.shots ? 100 * mode.hits / mode.shots : null;
    // Pool by eligible hit count, not by round count. Valid hits have both measurements.
    mode.meanReactionSeconds = mode.hits ? ((mode.meanReactionSeconds ?? 0) * previousHits + (s.meanReactionSeconds ?? 0) * s.hits) / mode.hits : null;
    mode.meanPrecisionPixels = mode.hits ? ((mode.meanPrecisionPixels ?? 0) * previousHits + (s.meanPrecisionPixels ?? 0) * s.hits) / mode.hits : null;
    modes.set(s.mode, mode);
  }
  return { valid: files.length > 0 && files.every(f => f.valid), files: files.sort((a, b) => a.file.localeCompare(b.file)), modes: [...modes.values()].sort((a, b) => a.mode.localeCompare(b.mode)) };
}
