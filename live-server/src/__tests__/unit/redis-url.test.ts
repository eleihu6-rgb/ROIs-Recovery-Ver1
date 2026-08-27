import { describe, expect, it } from 'vitest'

import { parseRedisUrl } from '../../utils/redis-url.js'

describe('parseRedisUrl', () => {
  it('decodes URL-encoded Redis passwords for BullMQ', () => {
    expect(parseRedisUrl('redis://:Pier2026!qwer%23@192.168.199.120:6379/3')).toEqual({
      host: '192.168.199.120',
      port: 6379,
      password: 'Pier2026!qwer#',
      db: 3,
    })
  })

  it('omits password when Redis URL has no password', () => {
    expect(parseRedisUrl('redis://192.168.199.120:6379/3')).toEqual({
      host: '192.168.199.120',
      port: 6379,
      password: undefined,
      db: 3,
    })
  })

  it('returns localhost defaults for malformed URLs', () => {
    expect(parseRedisUrl('not-a-url')).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    })
  })
})
