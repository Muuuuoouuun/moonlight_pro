import assert from "node:assert/strict";
import { test } from "node:test";

import { createRefreshGenerationCoordinator } from "./refresh-generation.js";

test("settling an older refresh generation leaves a newer waiter pending", async () => {
  const coordinator = createRefreshGenerationCoordinator();
  const older = coordinator.request();
  const newer = coordinator.request();
  let newerSettled = false;
  newer.promise.then(() => { newerSettled = true; });

  coordinator.settle(older.generation);
  await older.promise;
  await Promise.resolve();
  assert.equal(newerSettled, false);

  coordinator.settle(newer.generation);
  await newer.promise;
  assert.equal(newerSettled, true);
});

test("cancel settles every outstanding refresh waiter", async () => {
  const coordinator = createRefreshGenerationCoordinator();
  const first = coordinator.request();
  const second = coordinator.request();

  coordinator.cancel();
  await Promise.all([first.promise, second.promise]);
});
