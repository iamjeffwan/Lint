import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

await mkdir('artifacts/phase1-ablation', { recursive: true })
const variants = [
  { name: 'remove-reconciliation', file: 'packages/cli/src/transport.ts', tests: 'packages/cli/src/cli.test.ts', filter: 'lost upload acknowledgement',
    mutate: text => text.replace("if (await reconcile()) return 'already_completed'", 'if (false) return \'already_completed\'') },
  { name: 'remove-single-use-check', file: 'packages/scan-service/src/service.ts', tests: 'packages/scan-service/src/service.test.ts', filter: 'accepts a valid result once',
    mutate: text => text.replace('if (session.tokenUsedAt)', 'if (false)') },
  { name: 'remove-persistence', file: 'packages/scan-service/src/store.ts', tests: 'packages/scan-service/src/store.test.ts', filter: 'keeps a task',
    mutate: text => text.replace('new Database(filePath)', "new Database(':memory:')") },
]
const report = []
for (const variant of variants) {
  const original = await readFile(variant.file, 'utf8')
  const changed = variant.mutate(original)
  assert.notEqual(changed, original)
  try {
    await writeFile(variant.file, changed)
    const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', variant.tests, '-t', variant.filter], { encoding: 'utf8' })
    const output = run.stdout + run.stderr
    await writeFile(`artifacts/phase1-ablation/${variant.name}.log`, output)
    assert.equal(run.status, 1, 'Removing required behavior should break the selected acceptance test')
    assert.match(output, /Failed Tests 1/)
    report.push({ name: variant.name, exitCode: run.status, expectedRegression: true, restored: true })
  } finally { await writeFile(variant.file, original) }
}
await writeFile('artifacts/phase1-ablation/results.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
