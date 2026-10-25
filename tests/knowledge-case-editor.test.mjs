import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../knowledge-map/case-editor.js', import.meta.url), 'utf8');
const context = { structuredClone };
runInNewContext(source, context);
const { updateCase } = context.SkillLoopCaseEditor;

test('editing a case preserves extra claims, links, source fields and archive state', () => {
  const existing = {
    id: 'case-1', archived: true, title: 'Old', date: '2026-01-01', summary: 'Old summary',
    source: { title: 'Source', url: 'https://example.org', publishedDate: '2026-01-01',
      checkedDate: '2026-01-02', section: 'Appendix' },
    claims: [
      { kind: 'source-supported', text: 'Old fact', sourceSection: 'Section 1', citation: 'ref-1' },
      { kind: 'source-supported', text: 'Second fact', sourceSection: 'Section 2' },
      { kind: 'teaching-inference', text: 'Old lesson' },
      { kind: 'teaching-inference', text: 'Second lesson' },
    ],
    links: [
      { topicId: 'old-topic', kind: 'context', reason: 'Carefully written reason' },
      { topicId: 'second-topic', kind: 'application', reason: 'Another reason' },
    ],
  };
  const before = structuredClone(existing);
  const changed = updateCase(existing, {
    topicId: 'new-topic', title: 'New', date: '2026-02-01', summary: 'New summary',
    sourceTitle: 'Source', sourceUrl: 'https://example.org', sourceDate: '2026-01-01',
    fact: 'Updated fact', sourceSection: 'Section 3', inference: 'Updated lesson',
  }, [{ id: 'new-topic', title: 'New topic' }], 'unused-id', '2026-02-02');

  assert.equal(changed.claims.length, 4);
  assert.equal(changed.claims[0].text, 'Updated fact');
  assert.equal(changed.claims[0].citation, 'ref-1');
  assert.equal(changed.claims[1].text, 'Second fact');
  assert.equal(changed.claims[2].text, 'Updated lesson');
  assert.equal(changed.claims[3].text, 'Second lesson');
  assert.equal(changed.links.length, 2);
  assert.equal(changed.links[0].topicId, 'new-topic');
  assert.equal(changed.links[0].kind, 'context');
  assert.equal(changed.links[0].reason, 'Carefully written reason');
  assert.deepEqual({ ...changed.links[1] }, before.links[1]);
  assert.equal(changed.source.section, 'Appendix');
  assert.equal(changed.archived, true);
  assert.deepEqual(existing, before);
});

test('list editing can add and remove claims and concept links without replacing case metadata', () => {
  const existing = { id: 'case-2', archived: false, editorialNote: 'Keep for review',
    source: { checkedDate: '2026-01-01', privateTag: 'verified' },
    claims: [{ kind: 'source-supported', text: 'Old reported fact', sourceSection: 'Section A' }],
    links: [{ topicId: 'first', kind: 'context', reason: 'The original relationship' }] };
  const updated = updateCase(existing, {
    title: 'New case', date: '2026-02-01', summary: 'Case summary',
    sourceTitle: 'Report', sourceUrl: 'https://example.org/report', sourceDate: '2026-01-25',
    claims: [
      { kind: 'teaching-inference', text: 'A first interpretation' },
      { kind: 'source-supported', text: 'A second reported fact', sourceSection: 'Section B' },
    ],
    links: [
      { topicId: 'second', kind: 'introduced', reason: 'This introduces the second topic' },
      { topicId: 'third', kind: 'application', reason: 'This applies the third topic' },
    ],
  }, [], 'unused-id', '2026-02-02');
  assert.equal(updated.claims.length, 2);
  assert.equal(updated.claims[1].sourceSection, 'Section B');
  assert.equal(updated.links.length, 2);
  assert.equal(updated.links[0].kind, 'introduced');
  assert.equal(updated.editorialNote, 'Keep for review');
  assert.equal(updated.source.privateTag, 'verified');
  assert.equal(existing.claims.length, 1);
});
