import type { RoundExport } from './types.ts';

export function serializeRoundExport(data: RoundExport): string {
  return JSON.stringify(data, (_key: string, value: unknown) => {
    // JSON otherwise silently changes NaN/Infinity into null, obscuring a data defect.
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Cannot export telemetry containing a non-finite number.');
    }
    return value;
  }, 2) + '\n';
}

export function getRoundExportFilename(data: RoundExport): string {
  const mode = data.round.mode.replace(/[^a-zA-Z0-9_-]/g, '_');
  const roundId = data.round.round_id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `adaptiveaim_${mode}_${roundId}.json`;
}

/** Download locally; the export is never sent to a server. */
export function downloadRoundJson(data: RoundExport): void {
  const blob = new Blob([serializeRoundExport(data)], { type: 'application/json;charset=utf-8' });
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(blob);
  try {
    anchor.href = url;
    anchor.download = getRoundExportFilename(data);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to start reading the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
