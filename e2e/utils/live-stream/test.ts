// Drop-in replacement for `@playwright/test` that live-streams the browser when
// PW_STREAM_URL is set. Specs opt in by importing { test, expect } from here
// instead of '@playwright/test'. With no env var it behaves identically to the
// stock test object (attachLiveStream is a no-op).

import { test as base, expect } from '@playwright/test'
import { attachLiveStream } from './live-stream'

export const test = base.extend({
  context: async ({ context }, use) => {
    await attachLiveStream(context)
    await use(context)
  },
})

export { expect }
