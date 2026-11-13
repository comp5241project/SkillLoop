const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { legacyToDefinition, studentView, evaluationView } = require('./case-contract.cjs');

function loadRunnerInventory(root) {
  const source = fs.readFileSync(path.join(root, 'correction-lab/levels.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'levels.js', timeout: 1000 });
  return context.window.SkillLoopLevels;
}

function convertLegacyCatalog(root) {
  const shared = require(path.join(root, 'shared/cases.json'));
  const source = require(path.join(root, 'docs/team-samples/samples.json'));
  if (JSON.stringify(shared.cases) !== JSON.stringify(source.cases))
    throw new Error('Deployed shared cases differ from the canonical samples');
  const definitions = {};
  for (const [caseId, legacy] of Object.entries(source.cases)) {
    definitions[caseId] = legacyToDefinition(legacy);
  }
  return definitions;
}

function convertStudentCatalog(root) {
  return Object.fromEntries(Object.entries(convertLegacyCatalog(root)).map(([id, definition]) => [id, studentView(definition)]));
}

function convertEvaluationCatalog(root) {
  const source = require(path.join(root, 'docs/team-samples/samples.json'));
  const definitions = convertLegacyCatalog(root);
  return Object.fromEntries(Object.entries(source.cases).map(([id, legacy]) => [id, evaluationView(legacy, definitions[id])]));
}

module.exports = { loadRunnerInventory, convertLegacyCatalog, convertStudentCatalog, convertEvaluationCatalog };
