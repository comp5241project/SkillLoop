const level = {
  fns: ['retryDelay'],
  checks: [
    { testId: 'ordinary-retry', run: 'const a = api.retryDelay(0), b = api.retryDelay(2); return { pass: a === 100 && b === 400, actual: "Delays: " + a + " ms and " + b + " ms." };' },
    { testId: 'retry-cap', run: 'const n = api.retryDelay(6); return { pass: n === 1000, actual: "Scheduled delay: " + n + " ms." };' },
    { testId: 'invalid-retry', run: 'const a = h.refusal(() => api.retryDelay(-1)), b = h.refusal(() => api.retryDelay(1.5)); return { pass: a.rejected && b.rejected, actual: "Rejected negative: " + a.rejected + "; rejected fraction: " + b.rejected + "." };' },
  ],
  repair: {
    template: 'function retryDelay(attempt) {\n/*invalid-attempt:check*/\n/*delay-cap:main*/\n}',
    defaults: { 'delay-cap:main': '  return 100 * 2 ** attempt;' },
    fixes: {
      'delay-cap': [
        { label: 'Cap the computed delay at 1,000 ms.', parts: { main: '  return Math.min(1000, 100 * 2 ** attempt);' } },
        { label: 'Use 1,000 ms for every retry.', parts: { main: '  return 1000;' } },
      ],
      'invalid-attempt': [
        { label: 'Round the attempt count.', parts: { check: '  attempt = Math.round(attempt);' } },
        { label: 'Reject a negative or non-integer attempt count.', parts: { check: '  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("Invalid retry count");' } },
      ],
    },
  },
};
module.exports = { level };
