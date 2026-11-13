/**
 * Copies what part 4 needs from docs/team-samples/samples.json into shared-samples.js.
 * docs/ is not deployed, so the browser and the API read this derived file instead.
 * Run after the team materials change:  node correction-lab/sync-shared.cjs
 * break.test.cjs fails if the copy is out of date.
 */
const fs = require('node:fs');
const path = require('node:path');

function build(source) {
  const cases = {};
  const dialogues = {};
  for (const [caseId, item] of Object.entries(source.cases)) {
    // referenceCode stays out of the browser copy; the tests read it from the source.
    const { caseId: id, title, scenario, aiClaim, requirements, topicIds, starterCode, issues, tests } = item;
    cases[caseId] = { caseId: id, title, scenario, aiClaim, requirements, topicIds, starterCode, issues, tests };
    dialogues[caseId] = source.samples[caseId].part4.input.dialogue;
  }
  const data = { topics: source.topics, cases, sampleDialogues: dialogues };
  return `/** Derived from docs/team-samples/samples.json by sync-shared.cjs. Do not edit by hand. */
(function (root) {
  const data = ${JSON.stringify(data, null, 2).replace(/\n/g, '\n  ')};
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.SkillLoopShared = data;
})(typeof self === 'object' ? self : globalThis);
`;
}

const sourceFile = path.join(__dirname, '..', 'docs', 'team-samples', 'samples.json');
const targetFile = path.join(__dirname, 'shared-samples.js');
if (require.main === module) {
  fs.writeFileSync(targetFile, build(JSON.parse(fs.readFileSync(sourceFile, 'utf8'))));
  console.log('Wrote correction-lab/shared-samples.js');
}
module.exports = { build, sourceFile, targetFile };
