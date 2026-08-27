#!/usr/bin/env node

import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const RULE_ENGINE_PORT = 3001

export const parseArgs = (argv) => ({
  dryRun: argv.includes('--dry-run'),
  checkOnly: argv.includes('--check-only'),
})


export const createServiceSpecs = (repoRoot) => {
  return [
    {
      name: 'gantt',
      cwd: path.join(repoRoot, 'gantt'),
      command: 'npm',
      args: ['run', 'dev'],
      port: 5173,
    },
    {
      name: 'live-server',
      cwd: path.join(repoRoot, 'live-server'),
      command: 'npm',
      args: ['run', 'dev'],
      port: 3000,
    },
    {
      name: 'altair-server',
      cwd: path.join(repoRoot, 'altair-server'),
      command: 'npm',
      args: ['run', 'dev'],
      port: 3006,
    },
  ]
}

const prefixLines = (stream, label) => {
  let buffer = ''

  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      process.stdout.write(`[${label}] ${line}\n`)
    }
  })

  stream.on('end', () => {
    if (buffer.length > 0) {
      process.stdout.write(`[${label}] ${buffer}\n`)
    }
  })
}

const isPortOpen = (port, host = '127.0.0.1') =>
  new Promise((resolve) => {
    const socket = new net.Socket()

    socket.setTimeout(750)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    const closeAsFalse = () => {
      socket.destroy()
      resolve(false)
    }
    socket.once('timeout', closeAsFalse)
    socket.once('error', closeAsFalse)
    socket.connect(port, host)
  })

export const getRuleEngineMode = async ({
  env = process.env,
  isPortOpen: checkPort = isPortOpen,
} = {}) => {
  if (await checkPort(RULE_ENGINE_PORT)) {
    return { kind: 'listening', port: RULE_ENGINE_PORT }
  }

  const command = env.RULE_ENGINE_START_CMD?.trim()
  if (command) {
    return { kind: 'spawn', command }
  }

  return {
    kind: 'missing',
    message: 'rule-engine:3001 is not listening and RULE_ENGINE_START_CMD is not set.',
  }
}

const spawnService = (service) => {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  prefixLines(child.stdout, service.name)
  prefixLines(child.stderr, service.name)
  return child
}

const spawnShellCommand = (label, command, cwd) => {
  const child = spawn('/bin/zsh', ['-lc', command], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  prefixLines(child.stdout, label)
  prefixLines(child.stderr, label)
  return child
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const services = createServiceSpecs(REPO_ROOT)
  const children = []

  const stopChildren = () => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM')
      }
    }
  }

  process.on('SIGINT', () => {
    stopChildren()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    stopChildren()
    process.exit(143)
  })

  const ruleEngineMode = await getRuleEngineMode()
  if (ruleEngineMode.kind === 'missing') {
    console.warn(`[warn] ${ruleEngineMode.message} Continuing without rule-engine.`)
  } else if (ruleEngineMode.kind === 'listening') {
    console.log(`rule-engine:${ruleEngineMode.port} already listening`)
  } else {
    console.log(`starting rule-engine via RULE_ENGINE_START_CMD: ${ruleEngineMode.command}`)
  }

  for (const service of services) {
    const alreadyListening = await isPortOpen(service.port)
    if (alreadyListening) {
      console.log(`${service.name}:${service.port} already listening`)
      continue
    }

    console.log(`starting ${service.name}:${service.port}`)
    if (args.dryRun || args.checkOnly) {
      continue
    }

    const child = spawnService(service)
    children.push(child)
    child.on('exit', (code, signal) => {
      console.log(`${service.name} exited (${signal ?? code ?? 'unknown'})`)
    })
  }

  if (ruleEngineMode.kind === 'spawn' && !args.dryRun && !args.checkOnly) {
    const child = spawnShellCommand('rule-engine', ruleEngineMode.command, REPO_ROOT)
    children.push(child)
  }

  if (args.checkOnly || args.dryRun) {
    return
  }

  await new Promise(() => {})
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
