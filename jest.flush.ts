/**
 * After every test: let promises and zero-delay timers that are still in flight
 * settle INSIDE act() while the tree is still mounted. Without this, query
 * results that arrive after the test body show up as "not wrapped in act(...)"
 * warnings and as timers that keep the worker alive.
 *
 * ORDER MATTERS: this file is listed BEFORE jest.setup.ts in setupFilesAfterEnv
 * and must not import React Native Testing Library at load time. RNTL registers
 * its own auto-cleanup afterEach when it is first imported; Jest runs same-level
 * afterEach hooks in definition order, so this flush runs first and the tree is
 * unmounted afterwards. RNTL is therefore only required lazily, inside the hook.
 *
 * The REAL timer functions are captured now, so the flush also works while a
 * test has Jest's fake timers installed.
 */
const realSetTimeout = globalThis.setTimeout;
const realSetImmediate = globalThis.setImmediate;

afterEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { act } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((r) => realSetTimeout(r, 0));
    await new Promise<void>((r) => realSetImmediate(r));
    await Promise.resolve();
  });
});
