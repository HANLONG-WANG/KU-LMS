import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scripts = fs.readdirSync('scripts').filter((name) => /^verify-.*\.mjs$/.test(name) && name !== 'verify-all.mjs').sort();
const results = scripts.map((name) => {
  const result = spawnSync(process.execPath, [path.join('scripts', name)], { encoding: 'utf8', timeout: 60000 });
  const passed = result.status === 0 && !result.error;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) console.error(result.stderr || result.stdout || result.error?.message);
  return { script: name, passed, exitCode: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message || '' };
});
const report = { generatedAt: new Date().toISOString(), passed: results.filter((result) => result.passed).length, total: results.length, results };
fs.mkdirSync('artifacts/fixes-2026-09-30', { recursive: true });
fs.writeFileSync('artifacts/fixes-2026-09-30/checks.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.passed}/${report.total} checks passed`);
if (report.passed !== report.total) process.exitCode = 1;
