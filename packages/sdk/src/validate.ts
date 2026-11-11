// A small JSON Schema check for the parts the contract uses: type, enum, required, properties, items, anyOf, allOf, $ref and
// the string and number bounds. The contract tests run every route's real answer through it, and a client may do the same.
import { SCHEMAS, type Schema } from './contract';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const typeOk = (t: string, v: unknown) => t === 'string' ? typeof v === 'string' : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : t === 'integer' ? Number.isInteger(v) : t === 'boolean' ? typeof v === 'boolean'
  : t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? !!v && typeof v === 'object' && !Array.isArray(v) : false;

/** Every way `v` fails the schema, as `path: what`. An empty list means it fits. */
export function validate(schema: Schema | string, v: unknown, path = '$', schemas: Record<string, Schema> = SCHEMAS): string[] {
  const s = typeof schema === 'string' ? schemas[schema] : schema; if (!s) return [`${path}: no schema named ${String(schema)}`];
  if (typeof s.$ref === 'string') return validate(s.$ref.split('/').pop()!, v, path, schemas);
  const out: string[] = [];
  if (Array.isArray(s.allOf)) for (const x of s.allOf as Schema[]) out.push(...validate(x, v, path, schemas));
  if (Array.isArray(s.anyOf)) { const tries = (s.anyOf as Schema[]).map(x => validate(x, v, path, schemas)); if (!tries.some(t => !t.length)) out.push(...tries.reduce((a, b) => (b.length < a.length ? b : a))); }
  if (typeof s.type === 'string' && !typeOk(s.type, v)) return [...out, `${path}: expected ${s.type}, got ${v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v}`];
  if (Array.isArray(s.enum) && !s.enum.includes(v)) out.push(`${path}: ${JSON.stringify(v)} is not one of ${s.enum.join(', ')}`);
  if (typeof v === 'string') { if (s.format === 'date-time' && !RFC3339.test(v)) out.push(`${path}: not an RFC 3339 UTC time`);
    if (typeof s.minLength === 'number' && v.length < s.minLength) out.push(`${path}: shorter than ${s.minLength}`); if (typeof s.maxLength === 'number' && v.length > s.maxLength) out.push(`${path}: longer than ${s.maxLength}`); }
  if (typeof v === 'number') { if (typeof s.minimum === 'number' && v < s.minimum) out.push(`${path}: below ${s.minimum}`); if (typeof s.maximum === 'number' && v > s.maximum) out.push(`${path}: above ${s.maximum}`); }
  if (Array.isArray(v) && s.items) v.forEach((x, i) => out.push(...validate(s.items as Schema, x, `${path}[${i}]`, schemas)));
  if (v && typeof v === 'object' && !Array.isArray(v)) { const o = v as Record<string, unknown>;
    for (const k of (s.required as string[] | undefined) ?? []) if (o[k] === undefined) out.push(`${path}.${k}: missing`);
    for (const [k, p] of Object.entries((s.properties as Record<string, Schema> | undefined) ?? {})) if (o[k] !== undefined) out.push(...validate(p, o[k], `${path}.${k}`, schemas)); }
  return out;
}
