import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const defaultDocClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'SmartFacultyGraph';
const GRAPH_ID = 'LC3';

/** DynamoDB allows at most 100 items in one transaction. */
export const MAX_ITEMS = 100;
export const MAX_REASON_LENGTH = 200;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * ISO-8601 date-time with an explicit offset (`+07:00` or `Z`), e.g. 2026-10-29T08:00:00+07:00.
 * The offset is required so a closure means the same instant to the route API, the map and staff.
 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

const badRequest = (error) => respond(400, { error });

function getCallerGroups(event) {
  const rawGroups = event?.requestContext?.authorizer?.claims?.['cognito:groups'];
  if (!rawGroups) return [];
  if (Array.isArray(rawGroups)) return rawGroups;
  if (typeof rawGroups === 'string') {
    const cleaned = rawGroups.replace(/[\[\]]/g, '');
    return cleaned.split(',').map((g) => g.trim()).filter(Boolean);
  }
  return [];
}

function getCallerIdentity(event) {
  const claims = event?.requestContext?.authorizer?.claims;
  return claims?.['cognito:username'] || claims?.sub || 'unknown';
}

/** Milliseconds for a valid ISO-8601-with-offset string; null otherwise (rejects 2026-02-30T…). */
export function parseClosureTime(value) {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value)) return null;
  // Date rolls 2026-02-30 into March, so check the written date and time are real first.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const [hour, minute] = value.slice(11, 16).split(':').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Validates one closure change. Returns { item } with the normalised change, or { error }.
 * `closed: true` may carry a time window and a reason; `closed: false` opens the element
 * and must not carry them (they are removed from the item).
 */
export function validateClosure(raw, index = null, nowMs = Date.now()) {
  const where = index === null ? '' : `items[${index}]: `;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `${where}each closure must be an object` };
  }

  const { element_id: elementId, closed } = raw;
  if (typeof elementId !== 'string' || !/^(NODE|EDGE)#.+/.test(elementId)) {
    return { error: `${where}element_id must start with NODE# (room) or EDGE# (walkway)` };
  }
  if (typeof closed !== 'boolean') {
    return { error: `${where}closed must be true or false` };
  }

  if (!closed) {
    const extra = ['closed_from', 'closed_until', 'closed_reason'].filter(
      (field) => raw[field] !== undefined && raw[field] !== null && raw[field] !== ''
    );
    if (extra.length > 0) {
      return { error: `${where}${extra.join(', ')} cannot be set when closed is false` };
    }
    return { item: { element_id: elementId, closed: false } };
  }

  const item = { element_id: elementId, closed: true };

  for (const field of ['closed_from', 'closed_until']) {
    const value = raw[field];
    if (value === undefined || value === null || value === '') continue;
    if (parseClosureTime(value) === null) {
      return { error: `${where}${field} must be an ISO-8601 date-time with an offset, e.g. 2026-10-29T08:00:00+07:00` };
    }
    item[field] = value;
  }

  if (item.closed_from && item.closed_until && parseClosureTime(item.closed_from) > parseClosureTime(item.closed_until)) {
    return { error: `${where}closed_from must be on or before closed_until` };
  }

  // A closure that has already ended would never block anything, so it is almost always a
  // typo (wrong year or day). Rejecting it makes staff notice instead of saving a no-op.
  if (item.closed_until && parseClosureTime(item.closed_until) < nowMs) {
    return { error: `${where}closed_until is already in the past` };
  }

  const reason = raw.closed_reason;
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') {
      return { error: `${where}closed_reason must be a string` };
    }
    const trimmed = reason.trim();
    if (trimmed.length > MAX_REASON_LENGTH) {
      return { error: `${where}closed_reason must be at most ${MAX_REASON_LENGTH} characters` };
    }
    if (trimmed) item.closed_reason = trimmed;
  }

  return { item };
}

/**
 * UpdateItem for one change. A missing window bound or reason is REMOVEd, so each PUT fully
 * replaces the element's closure instead of leaving a stale window from an earlier one.
 */
function toUpdate(tableName, graphId, item, closedBy) {
  const names = { '#closed': 'closed', '#closedBy': 'closed_by', '#elementId': 'element_id' };
  const values = { ':closed': item.closed, ':closedBy': closedBy };
  const sets = ['#closed = :closed', '#closedBy = :closedBy'];
  const removes = [];

  for (const field of ['closed_from', 'closed_until', 'closed_reason']) {
    const name = `#${field}`;
    names[name] = field;
    if (item[field] !== undefined) {
      values[`:${field}`] = item[field];
      sets.push(`${name} = :${field}`);
    } else {
      removes.push(name);
    }
  }

  return {
    Update: {
      TableName: tableName,
      Key: { graph_id: graphId, element_id: item.element_id },
      UpdateExpression: `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`,
      // Only an element the seeded graph already has can be closed; a typo must not create one.
      ConditionExpression: 'attribute_exists(#elementId)',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

/**
 * Builds the handler around an injectable document client and clock (`now`) so it can be
 * tested without AWS or the real time.
 * Body: one closure `{ element_id, closed, closed_from?, closed_until?, closed_reason? }`
 * or `{ items: [ ...closures ] }` to close a whole path in one all-or-nothing transaction.
 */
export function createHandler({
  docClient = defaultDocClient,
  tableName = TABLE_NAME,
  graphId = GRAPH_ID,
  now = () => new Date(),
} = {}) {
  return async function updateClosure(event) {
    const groups = getCallerGroups(event);
    if (!groups.includes('staff') && !groups.includes('admin')) {
      return respond(403, { error: 'Forbidden: Insufficient privileges' });
    }

    let body;
    if (typeof event?.body === 'string') {
      try {
        body = JSON.parse(event.body);
      } catch {
        return badRequest('Invalid JSON in request body');
      }
    } else {
      body = event?.body;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('Request body must be a closure object or { items: [...] }');
    }

    const isBatch = body.items !== undefined;
    if (isBatch && (!Array.isArray(body.items) || body.items.length === 0)) {
      return badRequest('items must be a non-empty array');
    }
    const rawItems = isBatch ? body.items : [body];
    if (rawItems.length > MAX_ITEMS) {
      return badRequest(`At most ${MAX_ITEMS} closures can be changed at once`);
    }

    const nowMs = now().getTime();
    const items = [];
    for (const [index, raw] of rawItems.entries()) {
      const result = validateClosure(raw, isBatch ? index : null, nowMs);
      if (result.error) return badRequest(result.error);
      items.push(result.item);
    }

    const seen = new Set();
    for (const item of items) {
      if (seen.has(item.element_id)) {
        return badRequest(`element_id ${item.element_id} appears more than once`);
      }
      seen.add(item.element_id);
    }

    const closedBy = getCallerIdentity(event);

    try {
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: items.map((item) => toUpdate(tableName, graphId, item, closedBy)),
        })
      );
    } catch (error) {
      if (error?.name === 'TransactionCanceledException') {
        const missing = (error.CancellationReasons || [])
          .map((reason, index) => (reason?.Code === 'ConditionalCheckFailed' ? items[index].element_id : null))
          .filter(Boolean);
        if (missing.length > 0) {
          return respond(404, { error: 'Graph element not found', element_ids: missing });
        }
      }
      // SDK messages can name the account and role, so they stay in the logs.
      console.error('Error updating closures:', error);
      return respond(500, { error: 'Failed to update closures' });
    }

    return respond(200, {
      message: items.length === 1 ? 'Closure updated' : `${items.length} closures updated`,
      data: items,
    });
  };
}

/**
 * Lambda handler for staff to open or close rooms (NODE#) and walkways (EDGE#).
 * Path: PUT /api/graph/closures (Cognito, staff or admin)
 */
export const handler = createHandler();
