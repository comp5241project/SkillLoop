/** Web Worker: runs hidden tests off the page so break.js can stop code that never finishes. */
importScripts('/correction-lab/break-runner.js');
self.onmessage = (event) => {
  const { code, fns, tests } = event.data;
  self.postMessage(self.SkillLoopRunner.runTests(code, fns, tests));
};
