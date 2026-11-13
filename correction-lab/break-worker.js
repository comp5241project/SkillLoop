/** Web Worker: runs the fixed tests off the page so break.js can stop code that never finishes. */
importScripts('/correction-lab/break-runner.js');
self.onmessage = async (event) => {
  const { code, fns, checks } = event.data;
  self.postMessage(await self.SkillLoopRunner.runTests(code, fns, checks));
};
