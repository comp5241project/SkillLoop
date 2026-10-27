import { QueueClient } from '@vercel/queue';
import { runAIJob } from './_knowledge-v4-jobs.mjs';

const queue = new QueueClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vercel invokes this Function only through the registered queue trigger.
export default queue.handleNodeCallback(async (message) => {
  if (!message || !UUID.test(message.jobId || '')) return;
  await runAIJob(message.jobId, { throwOnFailure: false });
});
