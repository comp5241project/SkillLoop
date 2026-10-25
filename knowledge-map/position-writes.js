(function (root) {
  function create(write, restore, failure) {
    const states = new Map();
    return function save(id, previous, target) {
      let state = states.get(id);
      if (!state) {
        state = { confirmed: { ...previous }, sequence: 0, queue: Promise.resolve() };
        states.set(id, state);
      }
      const sequence = ++state.sequence;
      state.queue = state.queue.then(async () => {
        try { await write(id, target); state.confirmed = { ...target }; }
        catch (error) {
          if (sequence === state.sequence) {
            restore(id, state.confirmed);
            failure(error);
          }
        }
      });
      return state.queue;
    };
  }
  root.SkillLoopPositionWrites = Object.freeze({ create });
})(globalThis);
