/**
 * Shared plumbing for the scripts in this folder.
 *
 * Everything they need — stack name, region, API URL, bucket, table — comes from
 * samconfig.toml and the deployed stack's Outputs, never from a hardcoded string.
 * That is what lets every teammate run the same commands against their own AWS
 * Academy account and get their own environment instead of touching someone else's.
 *
 * These shell out to the `aws` and `sam` CLIs rather than using the AWS SDK: the
 * repo root carries no dependencies (AGENTS.md), `aws s3 sync --delete` is not
 * worth reimplementing, and the CLIs already read the Learner Lab credentials the
 * team pastes into their terminal.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../../tools/data-extraction/lc3/csv.mjs'

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * `sam` and `npm` are .cmd shims on Windows, which Node refuses to spawn without a
 * shell, so a shell it is — and then every argument has to be quoted by hand, because
 * a shell concatenates them and a teammate whose path is C:\Users\First Last\... would
 * otherwise see the command split in the middle of their own name.
 */
const needsShell = process.platform === 'win32'
const quote = (arg) => (needsShell && /[\s&|<>^]/.test(arg) ? `"${arg}"` : arg)

// Node warns about exactly the shell-plus-arguments combination above. The quoting is
// deliberate and these scripts use no other deprecated API, so the notice is only noise.
process.noDeprecation = true

export function fail(message) {
  console.error(`\n[FAIL] ${message}\n`)
  process.exit(1)
}

/** `--flag value` out of the command line, so every script accepts --stack/--region. */
export function flag(name, fallback = undefined) {
  const argv = process.argv.slice(2)
  const i = argv.indexOf(`--${name}`)
  if (i !== -1 && argv[i + 1]) return argv[i + 1]
  const inline = argv.find((a) => a.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : fallback
}

export const hasSwitch = (name) => process.argv.slice(2).includes(`--${name}`)

/**
 * Resolves the stack name, region, and SAM configuration environment.
 *
 * Command-line flags take precedence. The stack name and region then fall back to
 * environment variables, the selected samconfig.toml deploy block, and built-in
 * defaults; the configuration environment defaults to dev. The TOML is parsed by
 * regex to avoid adding a dependency at the repository root.
 */
export function readStackConfig() {
  const path = join(repoRoot, 'samconfig.toml')
  const toml = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const configEnv = flag('config-env', 'dev')
  
  const safeEnv = configEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blockRegex = new RegExp(`\\[${safeEnv}\\.deploy\\.parameters\\][^[]*`, 'm')
  const match = toml.match(blockRegex)
  
  if (toml.trim().length > 0 && !match) {
    fail(`Configuration block [${configEnv}.deploy.parameters] not found in samconfig.toml`)
  }
  
  const envBlock = match?.[0] ?? ''
  const value = (key) => envBlock.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
  
  return {
    stackName: flag('stack', process.env.TORCH_STACK_NAME ?? value('stack_name') ?? 'torch-v2'),
    region: flag('region', process.env.AWS_REGION ?? value('region') ?? 'us-east-1'),
    configEnv,
  }
}

/** Runs a command with its output going straight to the terminal. Throws on failure. */
export function run(cmd, args, { allowFailure = false, cwd = repoRoot } = {}) {
  const result = spawnSync(cmd, args.map(quote), {
    stdio: 'inherit',
    shell: needsShell,
    cwd,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  })
  if (result.error?.code === 'ENOENT') fail(`\`${cmd}\` is not installed or not on PATH.`)
  if (!allowFailure && result.status !== 0) {
    fail(`\`${cmd} ${args.join(' ')}\` exited with ${result.status}.`)
  }
  return result.status ?? 1
}

/** Runs a command and captures its output instead of printing it. */
export function capture(cmd, args, { cwd = repoRoot } = {}) {
  const result = spawnSync(cmd, args.map(quote), {
    encoding: 'utf8',
    shell: needsShell,
    cwd,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  })
  if (result.error?.code === 'ENOENT') fail(`\`${cmd}\` is not installed or not on PATH.`)
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** Credential and "no stack yet" failures are the two everybody hits, so name the fix. */
function explain(stderr, stackName) {
  if (/ExpiredToken|InvalidClientTokenId|security token included in the request is (expired|invalid)/i.test(stderr)) {
    return 'AWS credentials have expired. Press Start Lab again, paste the fresh credentials into this terminal, and re-run.'
  }
  if (/Unable to locate credentials|NoCredentials/i.test(stderr)) {
    return 'No AWS credentials in this terminal. Paste the Learner Lab credentials (AWS Details -> Show) and re-run.'
  }
  if (/does not exist/i.test(stderr)) {
    return `Stack "${stackName}" does not exist in this account yet. Run \`npm run bootstrap\` first.`
  }
  return stderr.trim()
}

/** One `aws` call, parsed as JSON. */
export function awsJson(args, { stackName = '' } = {}) {
  const { status, stdout, stderr } = capture('aws', [...args, '--output', 'json'])
  if (status !== 0) fail(explain(stderr, stackName))
  try {
    return JSON.parse(stdout)
  } catch {
    fail(`Could not parse the output of \`aws ${args.join(' ')}\`.`)
  }
}

/**
 * The deployed stack's Outputs as a plain object:
 * { ApiUrl, SiteUrl, SiteBucketName, LocationsTableName }.
 */
export function getStackOutputs() {
  const { stackName, region, configEnv } = readStackConfig()
  const data = awsJson(
    ['cloudformation', 'describe-stacks', '--stack-name', stackName, '--region', region],
    { stackName }
  )
  const stack = data.Stacks?.[0]
  if (!stack) fail(`Stack "${stackName}" returned no description.`)
  const outputs = Object.fromEntries(
    (stack.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue])
  )
  return { stackName, region, configEnv, status: stack.StackStatus, outputs }
}

/** Number of records the seed file holds, so nothing has to hardcode 131. */
export function expectedRecordCount() {
  const seed = join(repoRoot, 'tools/data-extraction/lc3/lc3-locations.seed.json')
  return JSON.parse(readFileSync(seed, 'utf8')).records.length
}

/** Number of records the schedule seed file holds. */
export function expectedSchedulesRecordCount() {
  const seed = join(repoRoot, 'tools/data-extraction/lc3/lc3-schedules.seed.csv')
  return parseCsv(readFileSync(seed, 'utf8')).length
}

/** Primary keys (location_id) the locations seed file holds. */
export function expectedLocationKeys() {
  const seed = join(repoRoot, 'tools/data-extraction/lc3/lc3-locations.seed.json')
  return JSON.parse(readFileSync(seed, 'utf8')).records.map((r) => r.location_id)
}

/** Primary keys (room_code#schedule_slot) the schedule seed file holds. */
export function expectedScheduleKeys() {
  const seed = join(repoRoot, 'tools/data-extraction/lc3/lc3-schedules.seed.csv')
  return parseCsv(readFileSync(seed, 'utf8')).map(
    (r) => `${r.room_code}#${r.day_of_week}#${r.start_time}#${r.event_code}`
  )
}

export function banner(text) {
  console.log(`\n=== ${text} ${'='.repeat(Math.max(0, 68 - text.length))}`)
}
