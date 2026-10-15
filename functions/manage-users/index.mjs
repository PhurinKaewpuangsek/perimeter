import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminListGroupsForUserCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const defaultClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const VALID_ROLES = new Set(['admin', 'staff', 'user']);

export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function getCallerGroups(event) {
  const rawGroups = event?.requestContext?.authorizer?.claims?.['cognito:groups'];
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups;
  if (typeof rawGroups === 'string') {
    const cleaned = rawGroups.replace(/[\[\]]/g, '');
    return cleaned.split(',').map((g) => g.trim()).filter(Boolean);
  }
  return [];
}

function getAttr(attributes, name) {
  return attributes?.find((a) => a.Name === name)?.Value || '';
}

function isCaller(target, claims) {
  if (!target || !claims) return false;
  const decodedTarget = decodeURIComponent(target).toLowerCase();
  const callerSub = (claims.sub || '').toLowerCase();
  const callerEmail = (claims.email || '').toLowerCase();
  const callerUsername = (claims['cognito:username'] || '').toLowerCase();

  return (
    decodedTarget === callerSub ||
    decodedTarget === callerEmail ||
    decodedTarget === callerUsername
  );
}

async function getAdminGroupUsers(cognitoClient, userPoolId) {
  const adminGroupRes = await cognitoClient.send(
    new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: 'admin' })
  );
  const adminUsers = adminGroupRes.Users || [];
  const activeAdmins = adminUsers.filter((u) => u.Enabled !== false);
  return { adminUsers, activeAdmins };
}

function isUserInList(users, username) {
  const decoded = decodeURIComponent(username).toLowerCase();
  return users.some(
    (u) =>
      u.Username.toLowerCase() === decoded ||
      getAttr(u.Attributes, 'sub').toLowerCase() === decoded ||
      getAttr(u.Attributes, 'email').toLowerCase() === decoded
  );
}

export function createHandler({ cognitoClient = defaultClient, userPoolId = USER_POOL_ID } = {}) {
  return async function handleManageUsers(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('admin')) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Forbidden: Insufficient privileges' }),
      };
    }

    const claims = event?.requestContext?.authorizer?.claims || {};
    const method = event.httpMethod || event.requestContext?.http?.method || 'GET';

    if (method === 'GET') {
      try {
        const [usersRes, adminGroupRes, staffGroupRes, userGroupRes] = await Promise.all([
          cognitoClient.send(new ListUsersCommand({ UserPoolId: userPoolId })),
          cognitoClient.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: 'admin' })),
          cognitoClient.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: 'staff' })),
          cognitoClient.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: 'user' })),
        ]);

        const adminUsernames = new Set((adminGroupRes.Users || []).map((u) => u.Username));
        const staffUsernames = new Set((staffGroupRes.Users || []).map((u) => u.Username));
        const regularUsernames = new Set((userGroupRes.Users || []).map((u) => u.Username));

        const users = (usersRes.Users || []).map((u) => {
          let role = 'user';
          if (adminUsernames.has(u.Username)) {
            role = 'admin';
          } else if (staffUsernames.has(u.Username)) {
            role = 'staff';
          } else if (regularUsernames.has(u.Username)) {
            role = 'user';
          }

          return {
            username: u.Username,
            email: getAttr(u.Attributes, 'email') || u.Username,
            sub: getAttr(u.Attributes, 'sub'),
            role,
            status: u.UserStatus,
            enabled: u.Enabled !== false,
            createdAt: u.UserCreateDate ? new Date(u.UserCreateDate).toISOString() : undefined,
          };
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ users }),
        };
      } catch (err) {
        console.error('Failed to list users:', err);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'InternalServerError', message: err.message }),
        };
      }
    }

    if (method === 'POST') {
      let payload;
      try {
        payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }

      const { email, password, role } = payload;
      if (!email || !password || !role) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing required fields: email, password, and role are required' }),
        };
      }

      const normalizedRole = role.toLowerCase().trim();
      if (!VALID_ROLES.has(normalizedRole)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Invalid role: "${role}". Must be one of: admin, staff, user` }),
        };
      }

      try {
        // AdminCreateUser with MessageAction SUPPRESS and admin-set password, force change on first login
        const createRes = await cognitoClient.send(
          new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'email_verified', Value: 'true' },
            ],
            TemporaryPassword: password,
            MessageAction: 'SUPPRESS',
          })
        );

        const createdUsername = createRes.User?.Username || email;

        // Add to requested group (one role per user)
        await cognitoClient.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: createdUsername,
            GroupName: normalizedRole,
          })
        );

        return {
          statusCode: 201,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            message: 'User created successfully',
            user: {
              username: createdUsername,
              email,
              role: normalizedRole,
              status: createRes.User?.UserStatus || 'FORCE_CHANGE_PASSWORD',
            },
          }),
        };
      } catch (err) {
        console.error('Failed to create user:', err);
        return {
          statusCode: err.name === 'UsernameExistsException' ? 409 : 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: err.name || 'CreateUserError', message: err.message }),
        };
      }
    }

    if (method === 'PUT') {
      const rawUsername = event.pathParameters?.username || '';
      const username = decodeURIComponent(rawUsername).trim();
      if (!username) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing username in path parameters' }),
        };
      }

      let payload;
      try {
        payload = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }

      const { role, enabled } = payload;
      if (role === undefined && enabled === undefined) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'No fields provided to update (expected role or enabled)' }),
        };
      }

      const { adminUsers, activeAdmins } = await getAdminGroupUsers(cognitoClient, userPoolId);
      const isAdminUser = isUserInList(adminUsers, username);

      // Rule: Demotion checks
      if (role !== undefined) {
        const normalizedRole = role.toLowerCase().trim();
        if (!VALID_ROLES.has(normalizedRole)) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: `Invalid role: "${role}". Must be one of: admin, staff, user` }),
          };
        }

        if (isAdminUser && normalizedRole !== 'admin') {
          if (isCaller(username, claims)) {
            return {
              statusCode: 400,
              headers: CORS_HEADERS,
              body: JSON.stringify({ error: 'Cannot demote your own account' }),
            };
          }

          if (activeAdmins.length <= 1) {
            return {
              statusCode: 400,
              headers: CORS_HEADERS,
              body: JSON.stringify({ error: 'Cannot demote the last remaining admin' }),
            };
          }
        }
      }

      // Rule: Disable checks
      if (enabled === false) {
        if (isCaller(username, claims)) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Cannot disable your own account' }),
          };
        }

        if (isAdminUser && activeAdmins.length <= 1) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Cannot disable the last remaining admin' }),
          };
        }
      }

      try {
        // Execute role change if provided
        if (role !== undefined) {
          const normalizedRole = role.toLowerCase().trim();
          const groupsRes = await cognitoClient.send(
            new AdminListGroupsForUserCommand({
              UserPoolId: userPoolId,
              Username: username,
            })
          );

          const existingGroups = (groupsRes.Groups || []).map((g) => g.GroupName);
          for (const g of existingGroups) {
            if (VALID_ROLES.has(g) && g !== normalizedRole) {
              await cognitoClient.send(
                new AdminRemoveUserFromGroupCommand({
                  UserPoolId: userPoolId,
                  Username: username,
                  GroupName: g,
                })
              );
            }
          }

          if (!existingGroups.includes(normalizedRole)) {
            await cognitoClient.send(
              new AdminAddUserToGroupCommand({
                UserPoolId: userPoolId,
                Username: username,
                GroupName: normalizedRole,
              })
            );
          }
        }

        // Execute enable/disable if provided
        if (enabled === true) {
          await cognitoClient.send(
            new AdminEnableUserCommand({
              UserPoolId: userPoolId,
              Username: username,
            })
          );
        } else if (enabled === false) {
          await cognitoClient.send(
            new AdminDisableUserCommand({
              UserPoolId: userPoolId,
              Username: username,
            })
          );
        }

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'User updated successfully' }),
        };
      } catch (err) {
        console.error('Failed to update user:', err);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: err.name || 'UpdateUserError', message: err.message }),
        };
      }
    }

    if (method === 'DELETE') {
      const rawUsername = event.pathParameters?.username || '';
      const username = decodeURIComponent(rawUsername).trim();
      if (!username) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Missing username in path parameters' }),
        };
      }

      if (isCaller(username, claims)) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Cannot delete your own account' }),
        };
      }

      // Check if target is the last remaining active admin
      const { adminUsers, activeAdmins } = await getAdminGroupUsers(cognitoClient, userPoolId);
      const isAdminUser = isUserInList(adminUsers, username);

      if (isAdminUser && activeAdmins.length <= 1) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Cannot delete the last remaining admin' }),
        };
      }

      try {
        await cognitoClient.send(
          new AdminDeleteUserCommand({
            UserPoolId: userPoolId,
            Username: username,
          })
        );

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'User deleted successfully' }),
        };
      } catch (err) {
        console.error('Failed to delete user:', err);
        return {
          statusCode: 500,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: err.name || 'DeleteUserError', message: err.message }),
        };
      }
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'MethodNotAllowed', message: `Method ${method} is not allowed` }),
    };
  };
}

export const handler = createHandler();
