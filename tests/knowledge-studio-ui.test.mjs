import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../knowledge-map/studio-ui.js', import.meta.url), 'utf8');
const context = { window: {} };
runInNewContext(source, context);
const { views, relatedCounts, matchesConcept } = context.window.SkillLoopStudioUI;

test('studio exposes one task at a time and has a separate library and review', () => {
  assert.deepEqual([...views], ['library', 'concepts', 'relationships', 'questions', 'cases', 'research', 'review']);
});

test('related content counts use current draft links and ignore archived items', () => {
  const draft = {
    relations: [{ source: 'a', target: 'b' }, { source: 'c', target: 'a' }],
    questions: [{ topicId: 'a' }, { topicId: 'a', archived: true }, { topicId: 'b' }],
    events: [{ links: [{ topicId: 'a' }, { topicId: 'b' }] },
      { links: [{ topicId: 'a' }], archived: true }, { links: [{ topicId: 'b' }] }],
  };
  assert.deepEqual({ ...relatedCounts(draft, 'a') }, { relationships: 2, questions: 1, cases: 1 });
});

test('context navigation matches directed relationships and linked content', () => {
  assert.equal(matchesConcept('relationships', { source: 'b', target: 'a' }, 'a'), true);
  assert.equal(matchesConcept('relationships', { source: 'b', target: 'c' }, 'a'), false);
  assert.equal(matchesConcept('questions', { topicId: 'a' }, 'a'), true);
  assert.equal(matchesConcept('cases', { links: [{ topicId: 'b' }, { topicId: 'a' }] }, 'a'), true);
  assert.equal(matchesConcept('cases', { links: [{ topicId: 'b' }] }, 'a'), false);
  assert.equal(matchesConcept('cases', { links: [] }, null), true);
});

test('all task panels exist and list editors start collapsed', () => {
  const html = readFileSync(new URL('../knowledge-map/teacher.html', import.meta.url), 'utf8');
  for (const view of views) assert.match(html, new RegExp(`data-studio-view="${view}"`));
  for (const view of ['relationships', 'questions', 'cases'])
    assert.match(html, new RegExp(`data-new-editor="${view}"[\\s\\S]*?<form id="teacher-`));
  assert.match(html, /id="teacher-learning-view"[^>]*hidden/);
});
