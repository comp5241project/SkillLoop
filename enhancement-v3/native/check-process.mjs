import { runRegisteredChecks } from './check-engine.mjs';
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
process.stdout.write(JSON.stringify(await runRegisteredChecks(JSON.parse(raw))));
