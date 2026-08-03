#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectLabPackage,
  listPublishedLabs,
  publishLabPackage,
  scaffoldDryRun,
  testLabPackage,
} from './lab-factory.mjs'

function usage() {
  return [
    'Lab Factory CLI',
    '',
    '  node lab-factory-cli.mjs lint <labId>',
    '  node lab-factory-cli.mjs dry-run <labId> [--variant <name>]',
    '  node lab-factory-cli.mjs test <labId> [--variant <name>] [--author <name>]',
    '  node lab-factory-cli.mjs publish <labId> --test-run-id <id> --teacher <name> --approval-note <text>',
    '  node lab-factory-cli.mjs list',
  ].join('\n')
}

function parseFlags(args) {
  const flags = {}
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]
    if (!raw.startsWith('--')) continue
    const [name, inline] = raw.slice(2).split('=', 2)
    if (inline !== undefined) {
      flags[name] = inline
      continue
    }
    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      flags[name] = next
      index += 1
    } else {
      flags[name] = true
    }
  }
  return flags
}

export async function runLabFactoryCli(argv = process.argv.slice(2)) {
  const [command, labId, ...rest] = argv
  const flags = parseFlags(rest)
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { ok: true, usage: usage() }
  }
  if (command === 'list') return { ok: true, published: await listPublishedLabs() }
  if (!/^lab[1-8]$/.test(String(labId || ''))) {
    return { ok: false, error: 'labId 必须是 lab1-lab8', usage: usage() }
  }
  if (command === 'lint' || command === 'validate') return inspectLabPackage(labId)
  if (command === 'dry-run') return scaffoldDryRun(labId, { variant: flags.variant || undefined })
  if (command === 'test') {
    return testLabPackage(labId, {
      variant: flags.variant || undefined,
      author: String(flags.author || ''),
    })
  }
  if (command === 'publish') {
    return publishLabPackage(labId, {
      testRunId: String(flags['test-run-id'] || ''),
      approved: true,
      approvalNote: String(flags['approval-note'] || ''),
      teacher: String(flags.teacher || ''),
      author: String(flags.author || flags.teacher || ''),
    })
  }
  return { ok: false, error: `未知命令: ${command}`, usage: usage() }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runLabFactoryCli()
  if (result.usage && Object.keys(result).length === 2 && result.ok) {
    console.log(result.usage)
  } else {
    console.log(JSON.stringify(result, null, 2))
  }
  if (!result.ok) process.exitCode = 1
}
