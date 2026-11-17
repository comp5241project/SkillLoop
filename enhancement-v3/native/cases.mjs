import library from '../../enhancement-v2/m5-case-library.cjs';
import legacy from '../../shared/cases.json' with { type: 'json' };
import { nativeCaseIds } from './environment.mjs';

export function nativeCase(ref) {
  if (!nativeCaseIds.includes(ref?.caseId)) return null;
  const item = library.journeyCase(ref.caseId, ref.caseVersion, ref.conceptId);
  if (!item || !item.diagnosis?.questions.length) return null;
  const level = library.approvedRunner(item.definition);
  if (!level) return null;
  const { caseId, title, scenario, aiClaim, starterCode, topicIds, requirements } = item.publicCase;
  const display = { caseId, title, scenario, aiClaim, starterCode, topicIds,
    requirements: requirements.map(r => r.text),
    issues: item.definition.publicIssues, tests: item.definition.publicTests };
  const diagnosis = { tagline: title, summary: scenario, snippet: starterCode, stack: 'JavaScript', ...item.diagnosis };
  return { item, level, diagnosis, display, catalog: { topics: legacy.topics, cases: { [caseId]: display } } };
}

export function retryDisplay(level, display) {
  const issues = display.issues;
  const escape = value => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return {
    fns: level.fns,
    repair: level.repair,
    tryIt: 'Try counts 0, 6 and 1.5. Compare the computed delay or rejection with the requirements.',
    html: '<label for="attempt">Attempt count</label> <input id="attempt" type="number" value="6" step="any"> ' +
      '<button id="try">Calculate delay</button><p id="result" role="status"></p>',
    wire: 'document.querySelector("#try").onclick = () => { const n = document.querySelector("#attempt").valueAsNumber; ' +
      'let message; try { message = retryDelay(n) + " ms"; } catch (error) { message = error.message; } ' +
      'document.querySelector("#result").textContent = message; };',
    detectors: {
      'delay-cap': { fn: 'retryDelay', detect: 'return Number.isInteger(args[0]) && args[0] >= 4 && result > 1000;' },
      'invalid-attempt': { fn: 'retryDelay', detect: 'return (args[0] < 0 || !Number.isInteger(args[0])) && !error;' },
    },
    explain: Object.fromEntries(issues.map(issue => [issue.issueId, {
      question: 'Which behavior should the repair enforce for ' + escape(issue.title) + '?',
      answer: 0,
      options: [{ text: issue.suggestedChange, why: issue.observed },
        { text: 'Leave the current behavior in place.', why: 'Compare the case with its requirements.' }],
    }])),
  };
}
