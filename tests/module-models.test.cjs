const test = require('node:test');
const assert = require('node:assert/strict');
const correction = require('../correction-lab/server.cjs');

test('module model overrides work independently and keep the shared default', () => {
  const common = { AI_GATEWAY_API_KEY: 'test-only', AI_GATEWAY_MODEL: 'shared/model' };
  assert.equal(correction.provider(common).models.model, 'shared/model');
  assert.equal(correction.provider({ ...common, CORRECTION_AI_MODEL: 'correction/model' }).models.model, 'correction/model');
  assert.equal(correction.provider({ ...common, INTERVIEW_AI_MODEL: 'interview/model' }).models.model, 'shared/model');
});
