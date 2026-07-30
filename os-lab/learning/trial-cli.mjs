#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  calibrateReadinessThreshold,
  createLearningBackup,
  generateAnonymousAnalysis,
  restoreLearningBackup,
} from './trial-operations.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const [command, ...args] = process.argv.slice(2)

async function main() {
  if (command === 'analyze') {
    const target = path.resolve(args[0] || path.join(here, 'exports', `analysis-${Date.now()}.json`))
    await mkdir(path.dirname(target), { recursive: true })
    const analysis = generateAnonymousAnalysis({ includeParticipants: args.includes('--participants') })
    await writeFile(target, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8')
    console.log(`匿名分析已写入 ${target}（n=${analysis.cohortSize}）`)
    return
  }
  if (command === 'backup') {
    const result = await createLearningBackup({ backupRoot: args[0] })
    console.log(`备份完成 ${result.backupPath}\nSHA-256 ${result.manifest.sha256}`)
    return
  }
  if (command === 'restore') {
    if (!args[0] || !args[1] || !args.includes('--confirm')) throw new Error('恢复用法: restore <backup.db> <target.db> --confirm')
    const result = await restoreLearningBackup({ backupPath: args[0], targetPath: args[1], allowOverwrite: true })
    console.log(`恢复完成 ${result.targetPath}${result.rollbackPath ? `\n原库回滚副本 ${result.rollbackPath}` : ''}`)
    return
  }
  if (command === 'calibrate') {
    const fixture = JSON.parse(await readFile(path.join(here, 'traces-lab2-mock.json'), 'utf8'))
    console.log(JSON.stringify(calibrateReadinessThreshold(fixture.trajectories), null, 2))
    return
  }
  throw new Error('用法: trial-cli.mjs analyze [output.json] [--participants] | backup [dir] | restore <backup.db> <target.db> --confirm | calibrate')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
