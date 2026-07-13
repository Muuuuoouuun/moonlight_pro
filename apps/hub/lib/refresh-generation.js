export function createRefreshGenerationCoordinator() {
  let requestedGeneration = 0;
  let waiters = [];

  function resolveWhere(predicate) {
    const ready = [];
    const pending = [];

    waiters.forEach((waiter) => {
      if (predicate(waiter)) ready.push(waiter);
      else pending.push(waiter);
    });
    waiters = pending;
    ready.forEach((waiter) => waiter.resolve());
  }

  return {
    request() {
      requestedGeneration += 1;
      const generation = requestedGeneration;
      let resolve;
      const promise = new Promise((settlePromise) => {
        resolve = settlePromise;
      });
      waiters.push({ generation, resolve });
      return { generation, promise };
    },

    settle(completedGeneration) {
      resolveWhere((waiter) => waiter.generation <= completedGeneration);
    },

    cancel() {
      resolveWhere(() => true);
    },
  };
}
