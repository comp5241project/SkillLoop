// Test transport only; the production route never imports this module.
process.env.AI_BASE_URL = 'https://v3-fixture.invalid/v1';
process.env.AI_API_KEY = 'v3-test-key';
process.env.AI_MODEL = 'v3-test-model';
delete process.env.AI_ENABLE_THINKING;
const actualFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url !== 'https://v3-fixture.invalid/v1/chat/completions') return actualFetch(url, init);
  const { messages } = JSON.parse(init.body);
  const input = JSON.parse(messages[1].content);
  let value;
  if (input.fragments) {
    const empty = input.fragments.find(part => part.text.includes('The cart contract'));
    const discount = input.fragments.find(part => part.text.includes('A checkout discount'));
    if (!empty || !discount) return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'not JSON' } }] }));
    value = { title: 'Checkout edge cases', summary: 'Trace an empty cart and validate discount values at the edges of an inclusive range.',
      level: 'beginner', objectives: ['Predict an empty cart average.', 'Reject discounts outside the inclusive range.'],
      notes: [{ id: 'note-empty', heading: 'Empty cart', text: 'Return numeric zero before dividing when the cart has no units.',
        citations: [{ fragmentId: empty.id, quote: 'The cart contract requires averagePrice([]) to return numeric zero' }] },
      { id: 'note-discount', heading: 'Discount range', text: 'Both endpoints are allowed; reject percentages outside the inclusive range.',
        citations: [{ fragmentId: discount.id, quote: 'A checkout discount percentage must be between 0 and 100, inclusive.' }] }],
      questions: [] };
  } else if (input.candidates) {
    const unmatched = { caseId: 'retry-queue', reason: 'This case has no supporting material.', mapping: [] };
    if (input.objectives.every(goal => goal.includes('interpolation'))) value = { matches: [unmatched] };
    else value = { matches: [{ caseId: 'cart-checkout',
      reason: 'The cited material describes the cart average and the cart discount range.',
      concerns: [], mapping: [{ objectiveIndex: 0, requirementId: 'empty-cart', noteIds: ['note-empty'],
        reason: 'The note gives the required numeric zero return before division.' },
      { objectiveIndex: 1, requirementId: 'discount', noteIds: ['note-discount'],
        reason: 'The note identifies both inclusive endpoints and refusal outside the range.' }] }, unmatched] };
  } else if (input.answer) {
    if (input.answer === 'Testing feedback failure') return new Response('{}', { status: 503 });
    value = { feedback: 'Your response gives a concrete input and an expected behavior.',
      nextStep: 'Explain how the public requirement justifies that expected result.' };
  } else if (input.requirement.id === 'empty-cart') {
    value = { objectiveIndex: 0, explanation: 'With no units, dividing the total by the count produces NaN, but the cart contract calls for numeric zero.',
      caseApplication: 'Trace the count and total before the division in the supplied code.',
      practicePrompt: 'An empty cart has a zero total and count. What value should the average function return and why?',
      noteIds: ['note-empty'] };
  } else {
    value = { objectiveIndex: 0, explanation: 'An inclusive interval keeps both endpoints and rejects values outside rather than clamping.',
      caseApplication: 'The checkout calculation needs the validation rule before it computes a discounted total.',
      practicePrompt: 'Compare checkout with discounts of 100 percent and 102 percent. What should each input do and why?',
      noteIds: ['note-discount'] };
  }
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
};
