// Keep the deployed catalog identical to the team's source materials.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'docs/team-samples/samples.json'), 'utf8');
JSON.parse(source);
fs.writeFileSync(path.join(root, 'shared/cases.json'), source);
console.log('Updated shared/cases.json');
