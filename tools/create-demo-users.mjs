#!/usr/bin/env node
/**
 * Creates demo Cognito accounts for each role: admin, staff, user.
 *
 * Requirements:
 * - Credentials & UserPoolId come from stack outputs or environment variables.
 * - Passwords are read from environment variables (ADMIN_PASSWORD, STAFF_PASSWORD, USER_PASSWORD)
 *   with fallback values for local/sandbox development. No secrets committed.
 * - Assigns each user to their corresponding Cognito group.
 * - Sets permanent passwords so users can log in directly without FORCE_CHANGE_PASSWORD.
 *
 * Usage:
 *   node tools/create-demo-users.mjs
 *   ADMIN_PASSWORD=... STAFF_PASSWORD=... USER_PASSWORD=... node tools/create-demo-users.mjs
 */
import { banner, capture, fail, flag, getStackOutputs, readStackConfig } from '../scripts/lib/stack.mjs'

banner('create-demo-users')

const { region, stackName } = readStackConfig()

let userPoolId = flag('user-pool-id', process.env.COGNITO_USER_POOL_ID)
if (!userPoolId) {
  try {
    const { outputs } = getStackOutputs()
    userPoolId = outputs.UserPoolId
  } catch (err) {
    // If stack outputs call fails or UserPoolId is not yet deployed
  }
}

if (!userPoolId) {
  fail(
    `UserPoolId not found. Either deploy the updated template first:\n  npm run deploy\nor pass it manually:\n  node tools/create-demo-users.mjs --user-pool-id <UserPoolId>`
  )
}

console.log(`Target User Pool: ${userPoolId} (${region})`)

const adminPassword = process.env.ADMIN_PASSWORD
const staffPassword = process.env.STAFF_PASSWORD
const userPassword = process.env.USER_PASSWORD

if (!adminPassword || !staffPassword || !userPassword) {
  fail(
    `Missing required environment variables for demo account passwords.\n` +
    `Please set ADMIN_PASSWORD, STAFF_PASSWORD, and USER_PASSWORD in your environment before running this script.\n` +
    `Example (PowerShell):\n` +
    `  $env:ADMIN_PASSWORD="<YourAdminPassword>"\n` +
    `  $env:STAFF_PASSWORD="<YourStaffPassword>"\n` +
    `  $env:USER_PASSWORD="<YourUserPassword>"\n` +
    `  npm run seed:users`
  )
}

const DEMO_USERS = [
  {
    role: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@torch.dev',
    password: adminPassword,
    group: 'admin',
  },
  {
    role: 'staff',
    email: process.env.STAFF_EMAIL || 'staff@torch.dev',
    password: staffPassword,
    group: 'staff',
  },
  {
    role: 'user',
    email: process.env.USER_EMAIL || 'user@torch.dev',
    password: userPassword,
    group: 'user',
  },
]

for (const demo of DEMO_USERS) {
  console.log(`\nConfiguring ${demo.role.toUpperCase()} account (${demo.email})...`)

  // 1. Check if user exists
  const check = capture('aws', [
    'cognito-idp',
    'admin-get-user',
    '--user-pool-id',
    userPoolId,
    '--username',
    demo.email,
    '--region',
    region,
  ])

  if (check.status !== 0) {
    // User does not exist, create user
    console.log(`  Creating user ${demo.email}...`)
    const create = capture('aws', [
      'cognito-idp',
      'admin-create-user',
      '--user-pool-id',
      userPoolId,
      '--username',
      demo.email,
      '--user-attributes',
      `Name=email,Value=${demo.email}`,
      'Name=email_verified,Value=true',
      '--message-action',
      'SUPPRESS',
      '--region',
      region,
    ])
    if (create.status !== 0) {
      fail(`Failed to create user ${demo.email}: ${create.stderr}`)
    }
  } else {
    console.log(`  User ${demo.email} already exists. Updating password and group...`)
  }

  // 2. Set permanent password
  console.log(`  Setting permanent password...`)
  const setPass = capture('aws', [
    'cognito-idp',
    'admin-set-user-password',
    '--user-pool-id',
    userPoolId,
    '--username',
    demo.email,
    '--password',
    demo.password,
    '--permanent',
    '--region',
    region,
  ])
  if (setPass.status !== 0) {
    fail(`Failed to set password for ${demo.email}: ${setPass.stderr}`)
  }

  // 3. Add to group
  console.log(`  Adding to group "${demo.group}"...`)
  const addGroup = capture('aws', [
    'cognito-idp',
    'admin-add-user-to-group',
    '--user-pool-id',
    userPoolId,
    '--username',
    demo.email,
    '--group-name',
    demo.group,
    '--region',
    region,
  ])
  if (addGroup.status !== 0) {
    fail(`Failed to add user ${demo.email} to group ${demo.group}: ${addGroup.stderr}`)
  }

  console.log(`  ✓ ${demo.role.toUpperCase()} account ready!`)
}

console.log(`\n======================================================================`)
console.log(`Demo accounts created successfully!`)
console.log(`Role Matrix:`)
console.log(`  - admin@torch.dev -> Group: admin (Full access: create, edit, delete)`)
console.log(`  - staff@torch.dev -> Group: staff (Edit access: create, edit; delete forbidden)`)
console.log(`  - user@torch.dev  -> Group: user  (Read only: write forbidden)`)
console.log(`======================================================================\n`)
