#!/usr/bin/env node
/**
 * Loads the LC3 dataset into the table your own stack owns.
 *
 * The table name comes from the stack Outputs, never from a literal: that is what
 * stops a seed run in one person's terminal from writing into the table another
 * person is demoing from.
 *
 * Usage: npm run seed  [-- --dry-run]
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { awsJson, banner, fail, getStackOutputs, hasSwitch, repoRoot, run } from './lib/stack.mjs'

banner('seed')

const { region, outputs, configEnv } = getStackOutputs()

if (configEnv === 'prod') {
  console.log('⚠️  PRODUCTION SEEDING DETECTED ⚠️')
  console.log('Verifying AWS Caller Identity...')
  const identity = awsJson(['sts', 'get-caller-identity'])
  const configuredRole = process.env.AWS_OIDC_ROLE_ARN ?? ''
  const roleName = configuredRole.split('/').pop()
  const isCiRole = process.env.GITHUB_ACTIONS === 'true'
    && roleName
    && identity.Arn?.startsWith(`arn:aws:sts::${identity.Account}:assumed-role/${roleName}/`)

  // The production account ID must match exactly.
  if (identity.Account !== '287785301136') {
    fail(`Refusing to seed production in wrong account: ${identity.Account}. Expected 287785301136.`)
  }
  if (!isCiRole) {
    fail('Refusing to seed production outside the GitHub Actions CD pipeline role.')
  }
  console.log(`✅ Caller identity confirmed: Account ${identity.Account}\n`)
}

const locationsTable = outputs.LocationsTableName
if (!locationsTable) fail('The stack has no LocationsTableName output. Deploy first: npm run deploy')

const schedulesTable = outputs.SchedulesTableName
if (!schedulesTable) fail('The stack has no SchedulesTableName output. Deploy first: npm run deploy')

const graphTable = outputs.GraphTableName
if (!graphTable) fail('The stack has no GraphTableName output. Deploy first: npm run deploy')

// The seeder lives in tools/data-extraction and brings its own AWS SDK dependencies.
const toolsDir = join(repoRoot, 'tools', 'data-extraction')
if (!existsSync(join(toolsDir, 'node_modules'))) {
  console.log('installing the seeder dependencies (first run only)...')
  run('npm', ['ci', '--prefix', toolsDir])
}

/** Runs the selected dataset seeder for one table and forwards dry-run mode. */
const runSeeder = (table, type) => {
  console.log(`\n--- Seeding ${type} ---`)
  console.log(`table: ${table} (${region})\n`)
  run('node', [
    join(toolsDir, 'lc3', 'seed-dynamodb.mjs'),
    '--table',
    table,
    '--region',
    region,
    '--type',
    type,
    ...(hasSwitch('dry-run') ? ['--dry-run'] : []),
  ])
}

runSeeder(locationsTable, 'locations')
runSeeder(schedulesTable, 'schedules')
// Upserts structure only, so the closures staff set (#147) survive the re-seed on every merge.
runSeeder(graphTable, 'graph')
