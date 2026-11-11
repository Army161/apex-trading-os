// /api/mcp: the MCP server over Streamable HTTP, for Claude apps as a custom connector (docs/design/10 s1). It needs an API
// key as a bearer token, the same keys as /api/v1. Every tool call is made through the v1 client into `serve`, in this
// process, with the caller's own key: so the key's scopes, the rate limits and the halt and budget rules apply to an MCP call
// exactly as they do to an API call, and this route can do nothing the API cannot.
// It is stateless: one request, one JSON answer. There is no session to hijack and no stream to hold open.
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildServer, type Api } from '@apex/mcp';
import { ApexClient } from '@apex/sdk';
import { deps } from '@/lib/api/deps';
import { serve } from '@/lib/api/serve';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) => new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

export async function POST(req: Request) {
  const auth = req.headers.get('authorization'), caller = auth ? await deps.key(auth) : null;
  if (!auth || !caller) return rpcError(401, auth ? 'That key is not known or has been revoked.' : 'Send an Apex API key: Authorization: Bearer apx_<id>_<secret>. Make one on the dashboard under You, Setup.', { 'www-authenticate': 'Bearer' });
  const client = new ApexClient({ baseUrl: new URL(req.url).origin, apiKey: auth.replace(/^Bearer\s+/i, ''), fetch: ((url: string | URL | Request, init?: RequestInit) => serve(new Request(url, init), deps)) as typeof fetch });
  const api: Api = { call: (id, a) => (client.call as (i: typeof id, x: unknown) => Promise<never>)(id, a ?? {}), reportMarkdown: id => client.reportMarkdown(id).catch(() => null) };
  const server = buildServer(api), transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try { await server.connect(transport); return await transport.handleRequest(req); }
  catch { return rpcError(500, 'The MCP request could not be handled.'); }
  finally { await server.close().catch(() => {}); }
}
// No stream is offered and there is no session to end, so the other verbs of the transport are not served.
const no = () => rpcError(405, 'This MCP endpoint answers POST only.', { allow: 'POST' });
export const GET = no, DELETE = no;
