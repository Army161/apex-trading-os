// `npm run openapi`: write docs/design/openapi.yaml from the contract.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openapiYaml } from './openapi';
const out = join(import.meta.dirname, '../../../docs/design/openapi.yaml');
writeFileSync(out, openapiYaml()); console.log(`wrote ${out}`);
