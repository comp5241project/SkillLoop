/** Run locally: node enhancement-v2/m2-demo-cli.cjs. No network or UI. */
const { fixtures, reviewedVariants } = require('./m2-preflight/diagnosis-fixtures.json');
const { createTeachingDemonstration, authoredComparators } = require('./m2-teaching-demo.cjs');

async function main() {
  const chooseFallback = process.argv.includes('--select-authored-fallback');
  const scenarios = [['Student A', fixtures[0]], ['Student B', fixtures[1]],
    ['Reviewed paraphrase', reviewedVariants[0]]];
  for (const [label, fixture] of scenarios) {
    const demo = await createTeachingDemonstration(fixture);
    console.log(JSON.stringify({ scenario: label, internalPreview: demo.internalPreview(),
      studentDelivery: demo.studentDelivery(),
      ...(chooseFallback ? { explicitlySelectedFallback: demo.selectAuthoredFallback() } : {}) }, null, 2));
  }
  const failed = await createTeachingDemonstration(fixtures[0], { async generate() { throw new Error('Mock provider unavailable'); } });
  const unreviewed = structuredClone(reviewedVariants[0]);
  unreviewed.record.learner.goal = 'internship';
  const needsReview = await createTeachingDemonstration(unreviewed);
  for (const [label, demo] of [['Provider failure', failed], ['Unreviewed diagnosis', needsReview]])
    console.log(JSON.stringify({ scenario: label, internalPreview: demo.internalPreview(),
      studentDelivery: demo.studentDelivery(),
      ...(chooseFallback ? { explicitlySelectedFallback: demo.selectAuthoredFallback() } : {}) }, null, 2));
  console.log(JSON.stringify({ authoredComparators: authoredComparators() }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
