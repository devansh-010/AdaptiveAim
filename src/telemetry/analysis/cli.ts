import { checkRoundFiles } from './roundBatch.ts';

const help = `Usage: npm run telemetry:check -- [--json] <file-or-folder> [...]

Checks schema 1.0.0, event links, counts, timestamps, shot boundaries, and metrics.
Folders include immediate .json files only. Inputs are read without modification.
--json  Print a machine-readable report (use npm run --silent to omit npm banners).
--help  Show this help.
Exit codes: 0 = valid (possibly with warnings), 1 = data/read error, 2 = usage error.
`;
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(help);
} else if (!args.some(arg => !arg.startsWith('--')) || args.some(arg => arg.startsWith('--') && arg !== '--json')) {
  console.error(help);
  process.exitCode = 2;
} else {
  const report = checkRoundFiles(args.filter(arg => arg !== '--json'));
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const file of report.files) {
      console.log(`${file.valid ? 'PASS' : 'FAIL'} ${file.file}`);
      const s = file.summary;
      if (s) {
        console.log(`  ${s.mode}: ${s.durationSeconds.toFixed(2)} s; ${s.hits}/${s.shots} hits (${s.accuracyPercent.toFixed(2)}%); ${s.samples} samples; ${s.trailingSegments} trailing segments`);
        const cadence = s.sampleIntervalsMs;
        console.log(`  Within-segment sample intervals, ms: min=${cadence.min ?? 'N/A'}, median=${cadence.median ?? 'N/A'}, p95=${cadence.p95 ?? 'N/A'}, max=${cadence.max ?? 'N/A'} (n=${cadence.count})`);
      }
      for (const issue of file.issues) console.log(`  ${issue.severity.toUpperCase()} ${issue.code} ${issue.path}: ${issue.message}`);
    }
    for (const mode of report.modes) {
      const display = (n: number | null, places: number) => n === null ? 'N/A' : n.toFixed(places);
      console.log(`${mode.mode} totals: ${mode.rounds} valid rounds (${mode.roundsWithWarnings} with warnings), ${mode.hits}/${mode.shots} hits, ${display(mode.accuracyPercent, 2)}% accuracy; hit-weighted means: ${display(mode.meanReactionSeconds, 3)} s reaction, ${display(mode.meanPrecisionPixels, 2)} px precision`);
    }
    console.log(`${report.valid ? 'Validation passed' : 'Validation failed'}. Totals exclude invalid and duplicate rounds. Warnings require review before collecting more data.`);
  }
  process.exitCode = report.valid ? 0 : 1;
}
