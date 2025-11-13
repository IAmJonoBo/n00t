import { spawnSync } from 'child_process';
import { expect, test } from 'vitest';
import path from 'path';

test('n00t: docs attribute checker exits zero', () => {
  const cwd = path.resolve(__dirname, '..');
  const res = spawnSync('node', ['scripts/check-attrs.mjs'], { stdio: 'pipe', cwd });
  if (res.status !== 0) {
    console.error(res.stdout?.toString());
    console.error(res.stderr?.toString());
  }
  expect(res.status).toBe(0);
});
