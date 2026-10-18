import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

describe('ManageUsersFunction Lambda Handler - Authorization', () => {
  test('returns 403 when event has no authorizer claims', async () => {
    const handler = createHandler({ cognitoClient: { send: async () => ({}) }, userPoolId: 'test-pool' });
    const response = await handler({
      httpMethod: 'GET',
      path: '/api/admin/users',
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Access-Control-Allow-Headers'], 'Content-Type,Authorization');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in user group', async () => {
    const handler = createHandler({ cognitoClient: { send: async () => ({}) }, userPoolId: 'test-pool' });
    const response = await handler({
      httpMethod: 'GET',
      path: '/api/admin/users',
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-uuid',
            email: 'user@torch.dev',
            'cognito:groups': 'user',
          },
        },
      },
    });

    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in staff group', async () => {
    const handler = createHandler({ cognitoClient: { send: async () => ({}) }, userPoolId: 'test-pool' });
    const response = await handler({
      httpMethod: 'GET',
      path: '/api/admin/users',
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            email: 'staff@torch.dev',
            'cognito:groups': 'staff',
          },
        },
      },
    });

    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });
});

describe('ManageUsersFunction Lambda Handler - GET /api/admin/users', () => {
  test('returns list of users with their roles when caller is admin', async () => {
    const mockUsers = [
      {
        Username: 'admin@torch.dev',
        Enabled: true,
        UserStatus: 'CONFIRMED',
        UserCreateDate: new Date('2026-10-01T00:00:00Z'),
        Attributes: [
          { Name: 'sub', Value: 'sub-admin' },
          { Name: 'email', Value: 'admin@torch.dev' },
        ],
      },
      {
        Username: 'staff@torch.dev',
        Enabled: true,
        UserStatus: 'CONFIRMED',
        UserCreateDate: new Date('2026-10-02T00:00:00Z'),
        Attributes: [
          { Name: 'sub', Value: 'sub-staff' },
          { Name: 'email', Value: 'staff@torch.dev' },
        ],
      },
      {
        Username: 'user@torch.dev',
        Enabled: false,
        UserStatus: 'FORCE_CHANGE_PASSWORD',
        UserCreateDate: new Date('2026-10-03T00:00:00Z'),
        Attributes: [
          { Name: 'sub', Value: 'sub-user' },
          { Name: 'email', Value: 'user@torch.dev' },
        ],
      },
    ];

    const sendMock = mock.fn(async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'ListUsersCommand') {
        return { Users: mockUsers };
      }
      if (name === 'ListUsersInGroupCommand') {
        if (cmd.input.GroupName === 'admin') {
          return { Users: [{ Username: 'admin@torch.dev' }] };
        }
        if (cmd.input.GroupName === 'staff') {
          return { Users: [{ Username: 'staff@torch.dev' }] };
        }
        if (cmd.input.GroupName === 'user') {
          return { Users: [{ Username: 'user@torch.dev' }] };
        }
        return { Users: [] };
      }
      throw new Error(`Unexpected command: ${name}`);
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'GET',
      path: '/api/admin/users',
      requestContext: {
        authorizer: {
          claims: {
            sub: 'sub-admin',
            email: 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const body = JSON.parse(response.body);
    assert.equal(Array.isArray(body.users), true);
    assert.equal(body.users.length, 3);

    const admin = body.users.find((u) => u.username === 'admin@torch.dev');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.email, 'admin@torch.dev');
    assert.equal(admin.sub, 'sub-admin');
    assert.equal(admin.enabled, true);
    assert.equal(admin.status, 'CONFIRMED');

    const staff = body.users.find((u) => u.username === 'staff@torch.dev');
    assert.equal(staff.role, 'staff');

    const user = body.users.find((u) => u.username === 'user@torch.dev');
    assert.equal(user.role, 'user');
    assert.equal(user.enabled, false);
    assert.equal(user.status, 'FORCE_CHANGE_PASSWORD');
  });
});

describe('ManageUsersFunction Lambda Handler - POST /api/admin/users', () => {
  test('returns 400 if required fields are missing', async () => {
    const handler = createHandler({ cognitoClient: { send: async () => ({}) }, userPoolId: 'test-pool' });
    const response = await handler({
      httpMethod: 'POST',
      path: '/api/admin/users',
      body: JSON.stringify({ email: 'new@torch.dev' }), // missing password & role
      requestContext: {
        authorizer: {
          claims: {
            sub: 'sub-admin',
            email: 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Missing required fields/);
  });

  test('returns 400 if role is invalid', async () => {
    const handler = createHandler({ cognitoClient: { send: async () => ({}) }, userPoolId: 'test-pool' });
    const response = await handler({
      httpMethod: 'POST',
      path: '/api/admin/users',
      body: JSON.stringify({ email: 'new@torch.dev', password: 'TempPassword123!', role: 'invalid_role' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'sub-admin',
            email: 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Invalid role/);
  });

  test('creates user with AdminCreateUser (SUPPRESS, TemporaryPassword) and adds to group', async () => {
    const sentCommands = [];
    const sendMock = mock.fn(async (cmd) => {
      sentCommands.push(cmd);
      if (cmd.constructor.name === 'AdminCreateUserCommand') {
        return {
          User: {
            Username: cmd.input.Username,
            UserStatus: 'FORCE_CHANGE_PASSWORD',
            Enabled: true,
            Attributes: cmd.input.UserAttributes,
          },
        };
      }
      if (cmd.constructor.name === 'AdminAddUserToGroupCommand') {
        return {};
      }
      throw new Error(`Unexpected command: ${cmd.constructor.name}`);
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'POST',
      path: '/api/admin/users',
      body: JSON.stringify({
        email: 'staff2@torch.dev',
        password: 'TemporaryPass123!',
        role: 'staff',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'sub-admin',
            email: 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 201);
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'User created successfully');
    assert.equal(body.user.email, 'staff2@torch.dev');
    assert.equal(body.user.role, 'staff');
    assert.equal(body.user.status, 'FORCE_CHANGE_PASSWORD');

    // Verify AdminCreateUserCommand args
    const createCmd = sentCommands.find((c) => c.constructor.name === 'AdminCreateUserCommand');
    assert.ok(createCmd);
    assert.equal(createCmd.input.UserPoolId, 'test-user-pool');
    assert.equal(createCmd.input.Username, 'staff2@torch.dev');
    assert.equal(createCmd.input.TemporaryPassword, 'TemporaryPass123!');
    assert.equal(createCmd.input.MessageAction, 'SUPPRESS');
    const emailAttr = createCmd.input.UserAttributes.find((a) => a.Name === 'email');
    assert.equal(emailAttr.Value, 'staff2@torch.dev');

    // Verify AdminAddUserToGroupCommand args
    const groupCmd = sentCommands.find((c) => c.constructor.name === 'AdminAddUserToGroupCommand');
    assert.ok(groupCmd);
    assert.equal(groupCmd.input.UserPoolId, 'test-user-pool');
    assert.equal(groupCmd.input.Username, 'staff2@torch.dev');
    assert.equal(groupCmd.input.GroupName, 'staff');
  });
});

describe('ManageUsersFunction Lambda Handler - PUT /api/admin/users/{username}', () => {
  test('rejects demoting caller themselves', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Attributes: [{ Name: 'sub', Value: 'admin-uuid' }] },
            { Username: 'admin2@torch.dev', Attributes: [{ Name: 'sub', Value: 'admin2-uuid' }] },
          ],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/admin@torch.dev',
      pathParameters: { username: 'admin@torch.dev' },
      body: JSON.stringify({ role: 'staff' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Cannot demote your own account/);
  });

  test('rejects demoting the last admin', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        // Only one admin in the system
        return {
          Users: [{ Username: 'admin-only@torch.dev', Attributes: [{ Name: 'sub', Value: 'admin-only-uuid' }] }],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/admin-only@torch.dev',
      pathParameters: { username: 'admin-only@torch.dev' },
      body: JSON.stringify({ role: 'staff' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'different-caller-uuid',
            email: 'caller@torch.dev',
            'cognito:username': 'caller@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Cannot demote the last remaining admin/);
  });

  test('rejects disabling caller themselves', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin-uuid' }] },
            { Username: 'admin2@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin2-uuid' }] },
          ],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/admin@torch.dev',
      pathParameters: { username: 'admin@torch.dev' },
      body: JSON.stringify({ enabled: false }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Cannot disable your own account/);
  });

  test('rejects disabling the last admin', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [{ Username: 'admin-only@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin-only-uuid' }] }],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/admin-only@torch.dev',
      pathParameters: { username: 'admin-only@torch.dev' },
      body: JSON.stringify({ enabled: false }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'other-uuid',
            email: 'other@torch.dev',
            'cognito:username': 'other@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Cannot disable the last remaining admin/);
  });

  test('successfully updates user role (removes old groups, adds new group)', async () => {
    const sentCommands = [];
    const sendMock = mock.fn(async (cmd) => {
      sentCommands.push(cmd);
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Enabled: true },
            { Username: 'admin2@torch.dev', Enabled: true },
          ],
        };
      }
      if (cmd.constructor.name === 'AdminListGroupsForUserCommand') {
        return {
          Groups: [{ GroupName: 'user' }],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/student@torch.dev',
      pathParameters: { username: 'student@torch.dev' },
      body: JSON.stringify({ role: 'staff' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'User updated successfully');

    // Check remove user group and add staff group
    const removeCmd = sentCommands.find((c) => c.constructor.name === 'AdminRemoveUserFromGroupCommand');
    assert.ok(removeCmd);
    assert.equal(removeCmd.input.GroupName, 'user');

    const addCmd = sentCommands.find((c) => c.constructor.name === 'AdminAddUserToGroupCommand');
    assert.ok(addCmd);
    assert.equal(addCmd.input.GroupName, 'staff');

    // Verify ordering: add new role first before removing old role
    assert.ok(
      sentCommands.indexOf(addCmd) < sentCommands.indexOf(removeCmd),
      'New group must be added before removing old group'
    );
  });

  test('does not remove old group if adding to new group fails during role update', async () => {
    const sentCommands = [];
    const sendMock = mock.fn(async (cmd) => {
      sentCommands.push(cmd);
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin-uuid' }] },
            { Username: 'admin2@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin2-uuid' }] },
          ],
        };
      }
      if (cmd.constructor.name === 'AdminListGroupsForUserCommand') {
        return {
          Groups: [{ GroupName: 'admin' }],
        };
      }
      if (cmd.constructor.name === 'AdminAddUserToGroupCommand') {
        const err = new Error('Cognito network failure');
        err.name = 'ServiceUnavailableException';
        throw err;
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/admin2@torch.dev',
      pathParameters: { username: 'admin2@torch.dev' },
      body: JSON.stringify({ role: 'staff' }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');

    // AdminAddUserToGroupCommand was attempted
    const addCmd = sentCommands.find((c) => c.constructor.name === 'AdminAddUserToGroupCommand');
    assert.ok(addCmd);

    // AdminRemoveUserFromGroupCommand was NEVER called, preserving original group
    const removeCmd = sentCommands.find((c) => c.constructor.name === 'AdminRemoveUserFromGroupCommand');
    assert.equal(removeCmd, undefined, 'Must not remove existing group when adding new group fails');
  });

  test('successfully enables and disables user', async () => {
    const sentCommands = [];
    const sendMock = mock.fn(async (cmd) => {
      sentCommands.push(cmd);
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Enabled: true },
            { Username: 'admin2@torch.dev', Enabled: true },
          ],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    // Disable
    const disableRes = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/staff1@torch.dev',
      pathParameters: { username: 'staff1@torch.dev' },
      body: JSON.stringify({ enabled: false }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });
    assert.equal(disableRes.statusCode, 200);
    assert.ok(sentCommands.find((c) => c.constructor.name === 'AdminDisableUserCommand'));

    // Enable
    const enableRes = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/staff1@torch.dev',
      pathParameters: { username: 'staff1@torch.dev' },
      body: JSON.stringify({ enabled: true }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });
    assert.equal(enableRes.statusCode, 200);
    assert.ok(sentCommands.find((c) => c.constructor.name === 'AdminEnableUserCommand'));
  });
});

describe('ManageUsersFunction Lambda Handler - DELETE /api/admin/users/{username}', () => {
  test('rejects deleting caller themselves', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin-uuid' }] },
            { Username: 'admin2@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin2-uuid' }] },
          ],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'DELETE',
      path: '/api/admin/users/admin@torch.dev',
      pathParameters: { username: 'admin@torch.dev' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Cannot delete your own account/);
  });

  test('rejects deleting the last remaining admin', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [{ Username: 'admin-only@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'admin-only-uuid' }] }],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'DELETE',
      path: '/api/admin/users/admin-only@torch.dev',
      pathParameters: { username: 'admin-only@torch.dev' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'different-uuid',
            email: 'diff@torch.dev',
            'cognito:username': 'diff@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Cannot delete the last remaining admin/);
  });

  test('successfully deletes user with AdminDeleteUserCommand', async () => {
    const sentCommands = [];
    const sendMock = mock.fn(async (cmd) => {
      sentCommands.push(cmd);
      if (cmd.constructor.name === 'ListUsersInGroupCommand') {
        return {
          Users: [
            { Username: 'admin@torch.dev', Enabled: true },
            { Username: 'admin2@torch.dev', Enabled: true },
          ],
        };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'DELETE',
      path: '/api/admin/users/former-staff@torch.dev',
      pathParameters: { username: 'former-staff@torch.dev' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:username': 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.message, 'User deleted successfully');

    const deleteCmd = sentCommands.find((c) => c.constructor.name === 'AdminDeleteUserCommand');
    assert.ok(deleteCmd);
    assert.equal(deleteCmd.input.UserPoolId, 'test-user-pool');
    assert.equal(deleteCmd.input.Username, 'former-staff@torch.dev');
  });
});

describe('ManageUsersFunction Lambda Handler - Resiliency & Edge Cases', () => {
  test('follows pagination tokens across multiple pages in GET', async () => {
    const listUsersPages = [
      {
        Users: [{ Username: 'user1@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'sub-1' }] }],
        PaginationToken: 'token-page-2',
      },
      {
        Users: [{ Username: 'user2@torch.dev', Enabled: true, Attributes: [{ Name: 'sub', Value: 'sub-2' }] }],
      },
    ];

    const listGroupPages = [
      {
        Users: [{ Username: 'user1@torch.dev' }],
        NextToken: 'group-token-2',
      },
      {
        Users: [{ Username: 'user2@torch.dev' }],
      },
    ];

    let userPageIdx = 0;
    let groupPageIdx = 0;

    const sendMock = mock.fn(async (cmd) => {
      const name = cmd.constructor.name;
      if (name === 'ListUsersCommand') {
        const page = listUsersPages[userPageIdx] || { Users: [] };
        userPageIdx++;
        return page;
      }
      if (name === 'ListUsersInGroupCommand') {
        if (cmd.input.GroupName === 'admin') {
          const page = listGroupPages[groupPageIdx] || { Users: [] };
          groupPageIdx++;
          return page;
        }
        return { Users: [] };
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'GET',
      path: '/api/admin/users',
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.users.length, 2);
    assert.equal(body.users[0].role, 'admin');
    assert.equal(body.users[1].role, 'admin');
  });

  test('rolls back created user if AdminAddUserToGroup fails in POST', async () => {
    const sentCommands = [];
    const sendMock = mock.fn(async (cmd) => {
      sentCommands.push(cmd);
      const name = cmd.constructor.name;
      if (name === 'AdminCreateUserCommand') {
        return { User: { Username: 'newly-created-user', UserStatus: 'FORCE_CHANGE_PASSWORD' } };
      }
      if (name === 'AdminAddUserToGroupCommand') {
        const err = new Error('Group assignment failed');
        err.name = 'GroupAssignmentError';
        throw err;
      }
      if (name === 'AdminDeleteUserCommand') {
        return {};
      }
      return {};
    });

    const handler = createHandler({
      cognitoClient: { send: sendMock },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'POST',
      path: '/api/admin/users',
      body: JSON.stringify({
        email: 'fail-group@torch.dev',
        password: 'Password1!',
        role: 'staff',
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            email: 'admin@torch.dev',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    const deleteCmd = sentCommands.find((c) => c.constructor.name === 'AdminDeleteUserCommand');
    assert.ok(deleteCmd, 'Expected AdminDeleteUserCommand to be called for rollback');
    assert.equal(deleteCmd.input.Username, 'newly-created-user');
  });

  test('rejects non-string role in POST and PUT with 400', async () => {
    const handler = createHandler({
      cognitoClient: { send: async () => ({}) },
      userPoolId: 'test-user-pool',
    });

    // POST with integer role
    const postRes = await handler({
      httpMethod: 'POST',
      path: '/api/admin/users',
      body: JSON.stringify({ email: 'test@torch.dev', password: 'Password1!', role: 123 }),
      requestContext: {
        authorizer: { claims: { sub: 'admin-uuid', 'cognito:groups': 'admin' } },
      },
    });
    assert.equal(postRes.statusCode, 400);
    assert.match(JSON.parse(postRes.body).error, /string/);

    // PUT with boolean role
    const putRes = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/test@torch.dev',
      pathParameters: { username: 'test@torch.dev' },
      body: JSON.stringify({ role: true }),
      requestContext: {
        authorizer: { claims: { sub: 'admin-uuid', 'cognito:groups': 'admin' } },
      },
    });
    assert.equal(putRes.statusCode, 400);
    assert.match(JSON.parse(putRes.body).error, /string/);
  });

  test('safely handles malformed percent encoding without throwing 502', async () => {
    const handler = createHandler({
      cognitoClient: {
        send: async (cmd) => {
          if (cmd.constructor.name === 'ListUsersInGroupCommand') {
            return { Users: [{ Username: 'admin@torch.dev', Enabled: true }, { Username: 'admin2@torch.dev', Enabled: true }] };
          }
          return {};
        },
      },
      userPoolId: 'test-user-pool',
    });

    const response = await handler({
      httpMethod: 'DELETE',
      path: '/api/admin/users/invalid%name',
      pathParameters: { username: 'invalid%name' },
      requestContext: {
        authorizer: { claims: { sub: 'admin-uuid', email: 'admin@torch.dev', 'cognito:groups': 'admin' } },
      },
    });

    assert.equal(response.statusCode, 200);
  });

  test('returns 500 with CORS headers if getAdminGroupUsers fails in PUT or DELETE', async () => {
    const handler = createHandler({
      cognitoClient: {
        send: async (cmd) => {
          if (cmd.constructor.name === 'ListUsersInGroupCommand') {
            const err = new Error('Cognito throttled');
            err.name = 'TooManyRequestsException';
            throw err;
          }
          return {};
        },
      },
      userPoolId: 'test-user-pool',
    });

    const putRes = await handler({
      httpMethod: 'PUT',
      path: '/api/admin/users/other@torch.dev',
      pathParameters: { username: 'other@torch.dev' },
      body: JSON.stringify({ role: 'staff' }),
      requestContext: {
        authorizer: { claims: { sub: 'admin-uuid', email: 'admin@torch.dev', 'cognito:groups': 'admin' } },
      },
    });

    assert.equal(putRes.statusCode, 500);
    assert.equal(putRes.headers['Access-Control-Allow-Origin'], '*');

    const delRes = await handler({
      httpMethod: 'DELETE',
      path: '/api/admin/users/other@torch.dev',
      pathParameters: { username: 'other@torch.dev' },
      requestContext: {
        authorizer: { claims: { sub: 'admin-uuid', email: 'admin@torch.dev', 'cognito:groups': 'admin' } },
      },
    });

    assert.equal(delRes.statusCode, 500);
    assert.equal(delRes.headers['Access-Control-Allow-Origin'], '*');
  });
});
