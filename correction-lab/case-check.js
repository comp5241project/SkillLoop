/**
 * Shape check for a correction case. Used by the server (AI drafts), the teacher page and the
 * student page, so a case that fails here is never shown. Returns a list of problems.
 */
(function (root) {
  const TOPICS = [
    'Software engineering fundamentals',
    'Effective use of AI coding agents',
    'Soft and product skills',
  ];
  const CONCEPTS = [
    'foundations',
    'requirements',
    'code-reading',
    'software-testing',
    'communication',
    'ai-code-review',
    'edge-cases',
  ];
  const FLUENCY = ['Delegation', 'Description', 'Discernment', 'Diligence'];

  function check(item) {
    const errors = [];
    const text = (value, max, name, optional) => {
      if (optional && value === undefined) return;
      if (typeof value !== 'string' || !value.trim()) errors.push(`${name} is missing.`);
      else if (value.length > max) errors.push(`${name} is longer than ${max} characters.`);
    };
    const choice = (question, name) => {
      if (!question || !Array.isArray(question.options) || question.options.length !== 3) {
        errors.push(`${name} needs exactly 3 options.`);
        return;
      }
      question.options.forEach((option, i) => {
        text(option && option.text, 200, `${name} option ${i + 1}`);
        text(option && option.why, 300, `${name} option ${i + 1} explanation`);
      });
      if (![0, 1, 2].includes(question.answer)) errors.push(`${name} needs a correct option.`);
    };
    if (!item || typeof item !== 'object') return ['The case is empty.'];

    if (typeof item.id !== 'string' || !/^[a-z0-9-]{3,60}$/.test(item.id)) errors.push('id is invalid.');
    if (!TOPICS.includes(item.topic)) errors.push('topic is not one of the three course topics.');
    if (!CONCEPTS.includes(item.conceptId)) errors.push('conceptId is not a shared concept ID.');
    if (item.fluency !== undefined && !FLUENCY.includes(item.fluency)) errors.push('fluency is invalid.');
    if (!['code', 'text'].includes(item.format)) errors.push('format must be code or text.');
    text(item.name, 60, 'name');
    text(item.kind, 30, 'kind');
    text(item.source, 80, 'source');
    text(item.title, 120, 'title');
    text(item.question, 400, 'question');

    const lines = Array.isArray(item.lines) ? item.lines : [];
    if (lines.length < 3 || lines.length > 14) errors.push('The answer needs 3 to 14 lines.');
    lines.forEach((line, i) => {
      if (typeof line !== 'string' || line.length > 160) errors.push(`Line ${i + 1} is invalid.`);
    });
    const valid = (n) => Number.isInteger(n) && typeof lines[n] === 'string' && lines[n].trim();
    const flaws = Array.isArray(item.flaws) ? item.flaws : [];
    const related = Array.isArray(item.related) ? item.related : [];
    if (flaws.length < 1 || flaws.length > 4) errors.push('Mark 1 to 4 wrong lines.');
    if (!flaws.every(valid) || !related.every(valid)) errors.push('A marked line does not exist.');
    if (related.some((n) => flaws.includes(n))) errors.push('A line cannot be both wrong and related.');
    if (new Set(flaws).size !== flaws.length) errors.push('A wrong line is listed twice.');
    const notes = item.notes && typeof item.notes === 'object' ? item.notes : {};
    flaws.forEach((n) => text(notes[n], 200, `Note for line ${n + 1}`));
    Object.keys(notes).forEach((key) => {
      if (!valid(Number(key))) errors.push(`Note ${key} points to a missing line.`);
    });

    choice(item.cause, 'Cause question');
    const fix = item.fix || {};
    text(fix.prompt, 200, 'Fix prompt');
    text(fix.title, 80, 'Fix title');
    text(fix.text, 400, 'Fix explanation');
    text(fix.example, 1200, 'Fix example');
    if (!Array.isArray(fix.criteria) || fix.criteria.length < 3 || fix.criteria.length > 5) {
      errors.push('The fix needs 3 to 5 criteria.');
    } else fix.criteria.forEach((c, i) => text(c, 120, `Criterion ${i + 1}`));
    text(item.apply && item.apply.question, 200, 'Apply question');
    choice(item.apply, 'Apply question');
    return errors;
  }

  const api = { check, TOPICS, CONCEPTS, FLUENCY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkillLoopCaseCheck = api;
})(typeof window === 'object' ? window : globalThis);
