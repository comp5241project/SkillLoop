/* Reviewed, static Exploration Units. New substantive edits require a new version. */
(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  if (root) root.SkillLoopCurated = catalog;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  const excalRevision = 'b7de45e88111f5680ae4bb3c3f3541c7d3b279fe';
  const sources = [
    { id: 'excal-readme', title: 'Excalidraw README', publisher: 'Excalidraw', kind: 'repository documentation',
      url: `https://github.com/excalidraw/excalidraw/blob/${excalRevision}/README.md`,
      verifiedAt: '2026-10-26', revision: excalRevision, path: 'README.md', location: 'Features: infinite canvas, export and navigation' },
    { id: 'excal-schema', title: 'Excalidraw JSON file format', publisher: 'Excalidraw', kind: 'repository documentation',
      url: `https://github.com/excalidraw/excalidraw/blob/${excalRevision}/dev-docs/docs/codebase/json-schema.mdx`,
      verifiedAt: '2026-10-26', revision: excalRevision, path: 'dev-docs/docs/codebase/json-schema.mdx', location: 'Attributes and JSON Schema example' },
    { id: 'cloudflare-incident', title: 'Cloudflare incident on October 30, 2023', publisher: 'Cloudflare', kind: 'incident postmortem',
      url: 'https://blog.cloudflare.com/cloudflare-incident-on-october-30-2023/', publishedAt: '2023-11-01',
      verifiedAt: '2026-10-26', location: 'Timeline, Analysis and Resolution' },
    { id: 'mdn-todo', title: 'Beginning our React ToDo app', publisher: 'MDN Web Docs', kind: 'tutorial',
      url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/React_todo_list_beginning',
      verifiedAt: '2026-10-26', location: 'Our app’s user stories and project starter code' },
    { id: 'mdn-state', title: 'React interactivity: Events and state', publisher: 'MDN Web Docs', kind: 'tutorial',
      url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Frameworks_libraries/React_interactivity_events_state',
      verifiedAt: '2026-10-26', location: 'Persisting and changing data with state; adding and deleting tasks' },
    { id: 'owasp-top10', title: 'OWASP Top 10:2021', publisher: 'OWASP', kind: 'versioned knowledge collection',
      url: 'https://top10.owasp.org/2021/', verifiedAt: '2026-10-26', location: '2021 category list and introduction' },
    { id: 'owasp-a01', title: 'A01:2021 – Broken Access Control', publisher: 'OWASP', kind: 'collection entry',
      url: 'https://top10.owasp.org/2021/A01_2021-Broken_Access_Control/', verifiedAt: '2026-10-26',
      location: 'Description and How to Prevent' },
    { id: 'owasp-a04', title: 'A04:2021 – Insecure Design', publisher: 'OWASP', kind: 'collection entry',
      url: 'https://top10.owasp.org/2021/A04_2021-Insecure_Design/', verifiedAt: '2026-10-26',
      location: 'Description, Secure Design and How to Prevent' },
  ];

  const graphs = [
    { schemaVersion: '0.3', id: 'excal-scene', version: 'v1', status: 'active', unitId: 'excalidraw-canvas', directionId: 'scene-format',
      title: 'Scene format', nodes: [
        { id: 'scene-file', title: '.excalidraw file', description: 'An open JSON export of a drawing.', contextNote: 'The repository documents this export as a way to save a scene.', sources: ['excal-readme', 'excal-schema'], x: 80, y: 120 },
        { id: 'elements', title: 'Elements', description: 'An array of objects representing canvas elements.', contextNote: 'The schema example includes a rectangle with an ID and geometry.', sources: ['excal-schema'], x: 360, y: 40 },
        { id: 'app-state', title: 'App state', description: 'Additional application state and configuration.', contextNote: 'The documented example includes grid size and background color.', sources: ['excal-schema'], x: 360, y: 210 },
      ], edges: [
        { id: 'scene-elements', source: 'scene-file', target: 'elements', label: 'contains', reason: 'The file format lists elements as a top-level array.', basis: 'source-supported', sources: ['excal-schema'] },
        { id: 'scene-state', source: 'scene-file', target: 'app-state', label: 'contains', reason: 'The file format lists appState as a top-level object.', basis: 'source-supported', sources: ['excal-schema'] },
      ] },
    { schemaVersion: '0.3', id: 'excal-scene', version: 'v2', status: 'active', unitId: 'excalidraw-canvas', directionId: 'scene-format',
      title: 'Scene format and image data', nodes: [
        { id: 'scene-file', title: '.excalidraw file', description: 'An open JSON export of a drawing.', contextNote: 'The repository documents this export as a way to save a scene.', sources: ['excal-readme', 'excal-schema'], x: 65, y: 150 },
        { id: 'elements', title: 'Elements', description: 'An array of objects representing canvas elements.', contextNote: 'The schema example includes a rectangle with an ID and geometry.', sources: ['excal-schema'], x: 350, y: 25 },
        { id: 'app-state', title: 'App state', description: 'Additional application state and configuration.', contextNote: 'The documented example includes grid size and background color.', sources: ['excal-schema'], x: 350, y: 155 },
        { id: 'files', title: 'Files', description: 'Image data associated with image elements.', contextNote: 'The example stores image data by file ID.', sources: ['excal-schema'], x: 350, y: 285 },
      ], edges: [
        { id: 'scene-elements', source: 'scene-file', target: 'elements', label: 'contains', reason: 'The file format lists elements as a top-level array.', basis: 'source-supported', sources: ['excal-schema'] },
        { id: 'scene-state', source: 'scene-file', target: 'app-state', label: 'contains', reason: 'The file format lists appState as a top-level object.', basis: 'source-supported', sources: ['excal-schema'] },
        { id: 'scene-files', source: 'scene-file', target: 'files', label: 'contains', reason: 'The file format lists files as data for image elements.', basis: 'source-supported', sources: ['excal-schema'] },
        { id: 'elements-files', source: 'elements', target: 'files', label: 'study alongside', reason: 'Compare an image element with its file data to understand how the saved scene is assembled. This is a learning path, not a claim about rendering order.', basis: 'teaching-association', sources: ['excal-schema'] },
      ] },
    { schemaVersion: '0.3', id: 'cloudflare-kv-incident', version: 'v1', status: 'active', unitId: 'cloudflare-kv-2023', directionId: 'failure-chain',
      title: 'Deployment and recovery chain', nodes: [
        { id: 'release-list', title: 'Release list', description: 'The deployment tool returned releases from staging and production together.', sources: ['cloudflare-incident'], x: 40, y: 35 },
        { id: 'production-route', title: 'Production route', description: 'The rollout pointed production traffic to a staging script version.', sources: ['cloudflare-incident'], x: 290, y: 35 },
        { id: 'kv-requests', title: 'Workers KV requests', description: 'Requests to the unreachable production destination returned HTTP 401.', sources: ['cloudflare-incident'], x: 540, y: 35 },
        { id: 'dependent-products', title: 'Dependent products', description: 'Products using KV, including Access, were affected.', sources: ['cloudflare-incident'], x: 540, y: 210 },
        { id: 'break-glass', title: 'Manual route repair', description: 'Engineers used a break-glass mechanism to restore a known working route.', sources: ['cloudflare-incident'], x: 290, y: 210 },
      ], edges: [
        { id: 'release-route', source: 'release-list', target: 'production-route', label: 'misdirected', reason: 'The mixed release list led the deployment automation to reference the staging script during promotion.', basis: 'source-supported', sources: ['cloudflare-incident'] },
        { id: 'route-kv', source: 'production-route', target: 'kv-requests', label: 'caused failures', reason: 'The referenced version was not authorized for production access, so KV calls returned HTTP 401.', basis: 'source-supported', sources: ['cloudflare-incident'] },
        { id: 'kv-products', source: 'kv-requests', target: 'dependent-products', label: 'affected', reason: 'First-party products relied on KV and failed when KV was unreachable.', basis: 'source-supported', sources: ['cloudflare-incident'] },
        { id: 'repair-route', source: 'break-glass', target: 'production-route', label: 'restored', reason: 'Engineers manually switched the production route to the previous working version.', basis: 'source-supported', sources: ['cloudflare-incident'] },
      ] },
    { schemaVersion: '0.3', id: 'mdn-todo-flow', version: 'v1', status: 'active', unitId: 'mdn-react-todo', directionId: 'stories-to-state',
      title: 'From user stories to state', nodes: [
        { id: 'user-stories', title: 'User stories', description: 'Read, add, complete, edit, delete and filter tasks.', sources: ['mdn-todo'], x: 40, y: 100 },
        { id: 'interface', title: 'Interface elements', description: 'The starter UI includes a form, task list, filters and count.', sources: ['mdn-todo'], x: 300, y: 20 },
        { id: 'task-state', title: 'Task state', description: 'The App component stores tasks with React state.', contextNote: 'The tutorial initializes tasks from props and updates them through setTasks.', sources: ['mdn-state'], x: 300, y: 205 },
        { id: 'event-handlers', title: 'Event handlers', description: 'Callbacks add, complete and delete tasks in response to user actions.', sources: ['mdn-state'], x: 560, y: 100 },
      ], edges: [
        { id: 'stories-interface', source: 'user-stories', target: 'interface', label: 'shape the UI', reason: 'Map each stated user goal to the form, list or filter controls. This is a teaching organization of the tutorial, not a technical dependency.', basis: 'teaching-association', sources: ['mdn-todo'] },
        { id: 'interface-handlers', source: 'interface', target: 'event-handlers', label: 'triggers', reason: 'The tutorial connects interactions such as submitting a form or clicking a task control to handler functions.', basis: 'source-supported', sources: ['mdn-state'] },
        { id: 'handlers-state', source: 'event-handlers', target: 'task-state', label: 'updates', reason: 'The tutorial uses setTasks when tasks are added or removed.', basis: 'source-supported', sources: ['mdn-state'] },
      ] },
    { schemaVersion: '0.3', id: 'owasp-risk-lens', version: 'v1', status: 'active', unitId: 'owasp-top10-2021', directionId: 'design-and-access',
      title: 'Access control and secure design', nodes: [
        { id: 'top10', title: 'OWASP Top 10:2021', description: 'A dated collection of ten web application security risk categories.', sources: ['owasp-top10'], x: 40, y: 140 },
        { id: 'a01', title: 'A01: Broken Access Control', description: 'A category about failures to enforce what users may do.', sources: ['owasp-a01'], x: 320, y: 35 },
        { id: 'server-check', title: 'Trusted server checks', description: 'OWASP advises enforcing access control in trusted server-side code or APIs.', sources: ['owasp-a01'], x: 610, y: 35 },
        { id: 'a04', title: 'A04: Insecure Design', description: 'A category focused on missing or ineffective control design.', sources: ['owasp-a04'], x: 320, y: 245 },
        { id: 'threat-model', title: 'Threat modeling', description: 'OWASP recommends considering threats and failure flows during design.', sources: ['owasp-a04'], x: 610, y: 245 },
      ], edges: [
        { id: 'top10-a01', source: 'top10', target: 'a01', label: 'includes', reason: 'A01 is a named category in the 2021 collection.', basis: 'source-supported', sources: ['owasp-top10'] },
        { id: 'top10-a04', source: 'top10', target: 'a04', label: 'includes', reason: 'A04 is a named category in the 2021 collection.', basis: 'source-supported', sources: ['owasp-top10'] },
        { id: 'a01-server', source: 'a01', target: 'server-check', label: 'recommends', reason: 'The A01 prevention guidance places authorization checks in trusted server-side code or APIs.', basis: 'source-supported', sources: ['owasp-a01'] },
        { id: 'a04-threat', source: 'a04', target: 'threat-model', label: 'recommends', reason: 'The A04 secure design guidance calls for threat modeling and explicit failure flows.', basis: 'source-supported', sources: ['owasp-a04'] },
        { id: 'a01-a04', source: 'a01', target: 'a04', label: 'compare while learning', reason: 'Compare an authorization enforcement failure with a missing control in the design. OWASP lists them as separate categories; this cross-category comparison is our teaching choice.', basis: 'teaching-association', sources: ['owasp-a01', 'owasp-a04'] },
      ] },
  ];

  const units = [
    { schemaVersion: '0.3', id: 'excalidraw-canvas', slug: 'excalidraw-canvas', version: 'v1', status: 'active', type: 'open-source',
      title: 'Excalidraw — How an Infinite Canvas Works', hook: 'A drawing becomes a portable scene.',
      guidingQuestion: 'What does Excalidraw save when you export a drawing?',
      summary: 'Read the documented scene format through its elements and application state.', level: 'Intermediate',
      topics: ['Open source', 'Canvas', 'Data model'], estimatedMinutes: 7, checkedAt: '2026-10-26', sources: ['excal-readme', 'excal-schema'],
      sections: [
        { id: 'overview', kind: 'overview', title: 'Why this project?', body: 'Excalidraw describes itself as an infinite, canvas-based whiteboard. Its README also advertises an open .excalidraw JSON export. That combination gives us a concrete question: what information must travel with a drawing?', sources: ['excal-readme'] },
        { id: 'artifact', kind: 'artifact', title: 'Inspect the artifact', body: 'The repository documents the exported file structure. Look at the top-level elements array and appState object before trying to infer any rendering behavior.', sources: ['excal-schema'] },
        { id: 'how', kind: 'how-it-works', title: 'How the saved scene is organized', body: 'The documented JSON example separates drawable elements from additional editor state. An element example includes an ID, type and geometry; appState includes settings such as grid size and background color. This describes the saved file, not the entire in-memory renderer.', sources: ['excal-schema'] },
        { id: 'activity', kind: 'activity', title: 'Try a close reading', body: 'Find one element property and one appState property in the schema example. Explain why they answer different questions about the same drawing.', sources: [] },
      ], directions: [{ id: 'scene-format', graphId: 'excal-scene', graphVersion: 'v1', title: 'Scene format', summary: 'Follow elements and editor state in the documented export.' }] },
    { schemaVersion: '0.3', id: 'excalidraw-canvas', slug: 'excalidraw-canvas', version: 'v2', status: 'active', type: 'open-source',
      title: 'Excalidraw — How an Infinite Canvas Works', hook: 'A drawing becomes a portable scene.',
      guidingQuestion: 'What does Excalidraw save when you export a drawing?',
      summary: 'Trace how elements, editor state and image data are represented in a documented scene file.', level: 'Intermediate',
      topics: ['Open source', 'Canvas', 'Data model'], estimatedMinutes: 9, checkedAt: '2026-10-26', sources: ['excal-readme', 'excal-schema'],
      sections: [
        { id: 'overview', kind: 'overview', title: 'A real drawing, a concrete artifact', body: 'Excalidraw describes itself as an infinite, canvas-based whiteboard with zoom and panning. It also offers an open .excalidraw JSON export. We can inspect that format to understand how a drawing is represented without claiming to have explained every part of its renderer.', sources: ['excal-readme'] },
        { id: 'artifact', kind: 'artifact', title: 'What to inspect', body: 'The pinned repository revision documents the export format. Its top-level properties include elements, appState and files. The example element has an ID, type and geometry; appState contains editor configuration; files holds image data associated with image elements.', sources: ['excal-schema'] },
        { id: 'how', kind: 'how-it-works', title: 'Separate content from context', body: 'Elements represent drawable objects. appState stores additional application state and configuration, while files holds image data. This separation helps explain what a portable scene contains. It does not by itself prove the order of rendering, synchronization or storage internals.', sources: ['excal-schema'] },
        { id: 'activity', kind: 'activity', title: 'Trace one image', body: 'In the pinned JSON example, locate the files map. What would you need to inspect next to connect a particular image element to its file data? Use the source rather than guessing from the diagram.', sources: [] },
      ], directions: [{ id: 'scene-format', graphId: 'excal-scene', graphVersion: 'v2', title: 'Scene format and image data', summary: 'Explore the elements, appState and files in a saved drawing.' }] },
    { schemaVersion: '0.3', id: 'cloudflare-kv-2023', slug: 'cloudflare-kv-2023', version: 'v1', status: 'active', type: 'case-study',
      title: 'Cloudflare Workers KV — A Rollout Failure', hook: 'One release-list bug became a multi-product outage.',
      guidingQuestion: 'How did a deployment tool fault spread, and why was recovery delayed?',
      summary: 'Read Cloudflare’s October 2023 postmortem as a chain of deployment, dependency and recovery decisions.', level: 'Intermediate',
      topics: ['Reliability', 'Deployment', 'Incident response'], estimatedMinutes: 10, checkedAt: '2026-10-26', sources: ['cloudflare-incident'],
      sections: [
        { id: 'overview', kind: 'overview', title: 'The incident', body: 'Cloudflare reports that several services were unavailable for 37 minutes on October 30, 2023. A Workers KV deployment tool mixed staging and production releases, and rollout automation routed production traffic to a staging version unavailable to production. KV requests returned HTTP 401.', sources: ['cloudflare-incident'] },
        { id: 'evidence', kind: 'evidence', title: 'Read the timeline', body: 'The postmortem marks impact from 19:54 to 20:31 UTC. Engineers attempted rollback and then used a break-glass route change at 20:15; KV error rates returned to normal by 20:29. These timestamps help distinguish detection, attempted rollback and actual recovery.', sources: ['cloudflare-incident'] },
        { id: 'how', kind: 'how-it-works', title: 'Why the failure spread', body: 'Workers KV was used by other Cloudflare products, including Access. The same dependency also complicated normal rollback tooling, so engineers used a manual break-glass route repair. The case illustrates how a shared service can affect both customer features and recovery paths.', sources: ['cloudflare-incident'] },
        { id: 'activity', kind: 'activity', title: 'Sketch a safer recovery path', body: 'Draw the dependency from deployment tool to KV to dependent products. Then mark the rollback tool. Which link would you test independently before the next rollout? Compare your answer with Cloudflare’s stated follow-up work.', sources: [] },
      ], directions: [{ id: 'failure-chain', graphId: 'cloudflare-kv-incident', graphVersion: 'v1', title: 'Deployment and recovery chain', summary: 'Trace the misroute, KV failures, affected products and manual repair.' }] },
    { schemaVersion: '0.3', id: 'mdn-react-todo', slug: 'mdn-react-todo', version: 'v1', status: 'active', type: 'build-something',
      title: 'Build a React Todo App from User Stories', hook: 'Start with what a person needs to do, then make the interface respond.',
      guidingQuestion: 'How do task actions become interface controls and state updates?',
      summary: 'Use MDN’s TodoMatic tutorial to connect user stories, UI elements, event handlers and task state.', level: 'Beginner',
      topics: ['React', 'State', 'User stories'], estimatedMinutes: 12, checkedAt: '2026-10-26', sources: ['mdn-todo', 'mdn-state'],
      sections: [
        { id: 'overview', kind: 'overview', title: 'The build challenge', body: 'MDN asks for a proof-of-concept task app that can read, add, complete, edit, delete and filter tasks. These user stories make a useful test: a feature is meaningful only if someone can use it to accomplish one of those goals.', sources: ['mdn-todo'] },
        { id: 'artifact', kind: 'artifact', title: 'Start with the visible pieces', body: 'The starter interface contains a form for a new task, buttons for filters, a remaining-task count and a list of task items. Read these pieces against the user stories before adding behavior.', sources: ['mdn-todo'] },
        { id: 'how', kind: 'how-it-works', title: 'Add behavior through state', body: 'The later MDN chapter adds event handling and React state. The App component stores tasks with useState, and handlers update that state for actions such as adding or deleting a task. Interface and state are connected through those callbacks.', sources: ['mdn-state'] },
        { id: 'activity', kind: 'activity', title: 'Build one vertical slice', body: 'Implement only the add-task story first. Describe the input, submit event, task state update and visible list change. Then test the same flow with a keyboard.', sources: [] },
      ], directions: [{ id: 'stories-to-state', graphId: 'mdn-todo-flow', graphVersion: 'v1', title: 'From user stories to state', summary: 'See how goals lead to controls, handlers and task data.' }] },
    { schemaVersion: '0.3', id: 'owasp-top10-2021', slug: 'owasp-top10-2021', version: 'v1', status: 'active', type: 'knowledge-collection',
      title: 'Read the OWASP Top 10 as a Risk Map', hook: 'A collection is more useful when you can compare its categories.',
      guidingQuestion: 'What can two different security risk categories teach us about control design?',
      summary: 'Use the dated 2021 OWASP collection to compare broken access control with insecure design.', level: 'Intermediate',
      topics: ['Security', 'Risk', 'Design'], estimatedMinutes: 11, checkedAt: '2026-10-26', sources: ['owasp-top10', 'owasp-a01', 'owasp-a04'],
      sections: [
        { id: 'overview', kind: 'overview', title: 'A dated collection, not a checklist', body: 'The OWASP Top 10:2021 names ten web application security risk categories. We use this specific edition as a map for inquiry. The categories are prompts to examine a system; seeing a category name does not prove a particular application has that weakness.', sources: ['owasp-top10'] },
        { id: 'artifact', kind: 'artifact', title: 'Compare two entries', body: 'A01 concerns broken access control and recommends enforcing checks in trusted server-side code or APIs. A04 concerns missing or ineffective control design and calls for threat modeling and explicit consideration of failure flows. Read each original entry for its scope and examples.', sources: ['owasp-a01', 'owasp-a04'] },
        { id: 'how', kind: 'how-it-works', title: 'Use a comparison question', body: 'Ask whether a control was designed and whether it is enforced where a client cannot bypass it. That pairing is our learning route across two separate OWASP categories. It is not a claim that every access control bug is caused by insecure design.', sources: ['owasp-a01', 'owasp-a04'] },
        { id: 'activity', kind: 'activity', title: 'Apply the lens', body: 'For a private project page, write one authorization rule and one misuse case. Where should the rule be enforced? Which assumption would you test during design? Check both OWASP entries before deciding.', sources: [] },
      ], directions: [{ id: 'design-and-access', graphId: 'owasp-risk-lens', graphVersion: 'v1', title: 'Access control and secure design', summary: 'Compare an enforced check with the design work that asks what to protect.' }] },
  ];

  return { schemaVersion: '0.3', index: [
    { id: 'excalidraw-canvas', latestVersion: 'v2', order: 1 },
    { id: 'cloudflare-kv-2023', latestVersion: 'v1', order: 2 },
    { id: 'mdn-react-todo', latestVersion: 'v1', order: 3 },
    { id: 'owasp-top10-2021', latestVersion: 'v1', order: 4 },
  ], sources, graphs, units };
});
