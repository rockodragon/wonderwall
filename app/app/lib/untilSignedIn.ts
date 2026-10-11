// Right after a sign-in resolves, the Convex client may not be sending the
// new session's token yet, so the first server call can come back "not
// signed in". That is the one error worth waiting out. Anything else — a
// refusal, a validation reason, a network failure — will not change on a
// retry, so it is thrown at once.
//
// `tries` counts calls, not retries: the default is 8 calls, 400ms apart.

import { isNotSignedIn } from "./convexError";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function untilSignedIn<T>(
  fn: () => Promise<T>,
  { tries = 8, delayMs = 400 }: { tries?: number; delayMs?: number } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isNotSignedIn(err) || attempt >= tries) throw err;
      await sleep(delayMs);
    }
  }
}
