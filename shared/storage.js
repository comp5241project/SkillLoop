/** Browser-local state helper; callers decide whether to use an account backend. */
(function () {
  const prefix = 'skillloop.v1.';
  const memory = new Map();
  let persistent = true;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function read(key, fallback) {
    if (!persistent && memory.has(key)) return clone(memory.get(key));
    try {
      const value = localStorage.getItem(prefix + key);
      if (value === null) return clone(fallback);
      const parsed = JSON.parse(value);
      const matches = Array.isArray(fallback)
        ? Array.isArray(parsed)
        : fallback !== null && typeof fallback === 'object'
          ? parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
          : typeof parsed === typeof fallback;
      return matches ? parsed : clone(fallback);
    } catch (_) {
      persistent = false;
      return memory.has(key) ? clone(memory.get(key)) : clone(fallback);
    }
  }
  function write(key, value) {
    memory.set(key, clone(value));
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
      persistent = true;
      return true;
    } catch (_) {
      persistent = false;
      return false;
    }
  }
  function appendEvent(event) {
    const saved = read('activity', []);
    const list = Array.isArray(saved) ? saved : [];
    write('activity', [...list, { ...event, at: new Date().toISOString() }].slice(-100));
  }
  function icons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.5 } });
  }
  window.SkillLoop = Object.freeze({ read, write, appendEvent, icons, storageAvailable: () => persistent });
})();
