import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';
import { GetCommand, QueryCommand, BatchWriteCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DeleteLocationFunction Lambda Handler', () => {
  test('returns 403 when event has no authorizer claims', async () => {
    const handler = createHandler({ docClient: { send: async () => {} }, tableName: 'T', schedulesTableName: 'S' });
    const response = await handler({ pathParameters: { location_id: '123' } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(response.headers['Access-Control-Allow-Headers'], 'Content-Type,Authorization');
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in user group', async () => {
    const handler = createHandler({ docClient: { send: async () => {} }, tableName: 'T', schedulesTableName: 'S' });
    const response = await handler({
      pathParameters: { location_id: '123' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-uuid',
            'cognito:groups': 'user',
          },
        },
      },
    });
    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 403 when caller is in staff group (staff cannot delete rooms)', async () => {
    const handler = createHandler({ docClient: { send: async () => {} }, tableName: 'T', schedulesTableName: 'S' });
    const response = await handler({
      pathParameters: { location_id: '123' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'staff-uuid',
            'cognito:groups': 'staff',
          },
        },
      },
    });
    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.match(body.error, /Forbidden/);
  });

  test('returns 400 with CORS headers when location_id path param is missing for authorized caller', async () => {
    const handler = createHandler({ docClient: { send: async () => {} }, tableName: 'T', schedulesTableName: 'S' });
    const response = await handler({
      pathParameters: null,
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            'cognito:groups': 'admin',
          },
        },
      },
    });
    assert.equal(response.statusCode, 400);
  });

  test('successfully cascade-deletes room and its schedules when caller is admin', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd instanceof GetCommand) {
        return { Item: { location_id: '123', room_code: 'LC3-123' } };
      }
      if (cmd instanceof QueryCommand) {
        return { Items: [{ room_code: 'LC3-123', schedule_slot: 'MON#09:00#TEST' }] };
      }
      if (cmd instanceof BatchWriteCommand || cmd instanceof DeleteCommand) {
        return {};
      }
    });

    const handler = createHandler({
      docClient: { send: sendMock },
      tableName: 'SmartFacultyLocations',
      schedulesTableName: 'SmartFacultySchedules'
    });

    const response = await handler({
      pathParameters: { location_id: '123' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            'cognito:groups': ['admin'],
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(sendMock.mock.callCount(), 4);
    assert.ok(sendMock.mock.calls[0].arguments[0] instanceof GetCommand);
    assert.ok(sendMock.mock.calls[1].arguments[0] instanceof QueryCommand);
    assert.ok(sendMock.mock.calls[2].arguments[0] instanceof BatchWriteCommand);
    assert.ok(sendMock.mock.calls[3].arguments[0] instanceof DeleteCommand);
  });

  test('deletes room when there are no schedules for admin', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: { location_id: '123', room_code: 'LC3-123' } };
      if (cmd instanceof QueryCommand) return { Items: [] }; // No schedules
      if (cmd instanceof DeleteCommand) return {};
    });

    const handler = createHandler({
      docClient: { send: sendMock },
      tableName: 'SmartFacultyLocations',
      schedulesTableName: 'SmartFacultySchedules'
    });

    const response = await handler({
      pathParameters: { location_id: '123' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(sendMock.mock.callCount(), 3); // Get, Query, Delete (No BatchWrite)
  });

  test('succeeds even if room has no room_code for admin', async () => {
    const sendMock = mock.fn(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: { location_id: '123' } }; // No room_code
      if (cmd instanceof DeleteCommand) return {};
    });

    const handler = createHandler({
      docClient: { send: sendMock },
      tableName: 'SmartFacultyLocations',
      schedulesTableName: 'SmartFacultySchedules'
    });

    const response = await handler({
      pathParameters: { location_id: '123' },
      requestContext: {
        authorizer: {
          claims: {
            sub: 'admin-uuid',
            'cognito:groups': 'admin',
          },
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(sendMock.mock.callCount(), 2); // Get, Delete (No Query, No BatchWrite)
  });
});
