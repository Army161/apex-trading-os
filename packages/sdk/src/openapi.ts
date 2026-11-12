// The OpenAPI 3.1 document for v1, built from the contract. `docs/design/openapi.yaml` is this output, written by
// `npm run openapi`, and a test fails when the file and the contract differ.
import { PROBLEMS, RATE, ROUTES, ROUTE_IDS, SCHEMAS, SCOPES, pathParams, routeClass, type RouteDef, type Schema } from './contract';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: ref('Problem') } } });
const HEADERS = { 'x-apex-mode': { description: '`paper`, or `live` only when the ledger holds a slot in a live stage.', schema: { type: 'string' } },
  'x-apex-trials': { description: 'Tries counted so far. Absent when no ledger is connected.', schema: { type: 'integer' } }, ETag: { description: 'Send it back in `If-None-Match` to get `304`.', schema: { type: 'string' } } };
const RESPONSES = { NotModified: { description: 'Not changed since the `ETag` you sent.' }, Unauthorized: problem('No key, an unknown key or a revoked key.'), ForbiddenScope: problem('The key does not hold the scope this route needs.'),
  NotFound: problem('Nothing with that id.'), Conflict: problem('Halted, out of budget or a run is in progress.'), Invalid: problem('The body or a query value is not valid.'),
  RateLimited: problem('Too many calls. `Retry-After` says when to try again.'), Unavailable: problem('No ledger is connected, or it could not be read.') };
const res = (name: keyof typeof RESPONSES) => ({ $ref: `#/components/responses/${name}` }), hdr = Object.fromEntries(Object.keys(HEADERS).map(h => [h, { $ref: `#/components/headers/${h}` }]));

export function openapi(): Schema {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const id of ROUTE_IDS) { const r: RouteDef = ROUTES[id], cls = routeClass(r), ok = String(r.status ?? 200);
    (paths[r.path] ??= {})[r.method.toLowerCase()] = { operationId: id, summary: r.summary, security: [{ apiKey: [r.scope] }], 'x-apex-rate': `${RATE[cls].limit} every ${RATE[cls].windowSec} seconds for each key`,
      parameters: [...pathParams(r.path).map(name => ({ name, in: 'path', required: true, schema: { type: 'string' } })), ...Object.entries(r.query ?? {}).map(([name, q]) => ({ name, in: 'query', required: false, description: q.about, schema: q.schema }))],
      ...(r.body ? { requestBody: { required: true, content: { 'application/json': { schema: ref(r.body) } } } } : {}),
      responses: { [ok]: { description: 'OK', headers: hdr, content: { 'application/json': { schema: ref(r.response) } } }, ...(r.method === 'GET' ? { '304': res('NotModified') } : {}),
        '401': res('Unauthorized'), '403': res('ForbiddenScope'), ...(pathParams(r.path).length ? { '404': res('NotFound') } : {}),
        ...(r.body ? { '409': res('Conflict') } : {}), '422': res('Invalid'), '429': res('RateLimited'), '503': res('Unavailable') } }; }
  return { openapi: '3.1.0',
    info: { title: 'Apex API', version: '1.0.0', description: 'Read the Apex ledger and queue a claim check. No route creates, changes or cancels an order, approves anything, resumes anything or changes a limit. Every performance figure is a Metric with its sample size and basis.' },
    servers: [{ url: '/api/v1' }], paths,
    components: { securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: `A key made in the dashboard under You, Setup: \`apx_<id>_<secret>\`. Scopes: ${SCOPES.join(', ')}. There is no scope for approve, resume, limits or live.` } }, headers: HEADERS, responses: RESPONSES, schemas: SCHEMAS },
    'x-apex-problem-codes': PROBLEMS };
}

const plain = /^[A-Za-z_][A-Za-z0-9_./-]*$/, words = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~']);
const scalar = (v: unknown) => typeof v === 'string' ? (plain.test(v) && !words.has(v.toLowerCase()) ? v : JSON.stringify(v)) : String(v);
const empty = (v: unknown) => Array.isArray(v) ? (v.length ? null : '[]') : v && typeof v === 'object' ? (Object.keys(v).length ? null : '{}') : scalar(v);
/** YAML for plain data: maps, lists, strings, numbers, booleans and null. Strings that could be read as anything else are quoted. */
export function toYaml(v: unknown, pad = ''): string {
  if (Array.isArray(v)) return v.map(x => { const e = empty(x); return e !== null ? `${pad}- ${e}\n` : `${pad}- ${toYaml(x, pad + '  ').slice(pad.length + 2)}`; }).join('');
  if (v && typeof v === 'object') return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => { const e = empty(x), key = scalar(k); return e !== null ? `${pad}${key}: ${e}\n` : `${pad}${key}:\n${toYaml(x, pad + '  ')}`; }).join('');
  return `${pad}${scalar(v)}\n`;
}
export const openapiYaml = () => `# Written by \`npm run openapi\` from packages/sdk/src/contract.ts. Do not edit by hand: change the contract and run it again.\n${toYaml(openapi())}`;
