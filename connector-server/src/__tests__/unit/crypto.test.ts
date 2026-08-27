import { describe, it, expect } from 'vitest'
import { generateHmacSignature, verifyHmacSignature, isTimestampValid, sha256 } from '../../utils/crypto.js'

describe('Crypto Utils', () => {
  describe('generateHmacSignature', () => {
    it('should generate valid HMAC-SHA256 signature', () => {
      const apiKey = 'test-api-key'
      const timestamp = 1700000000
      const body = '{"data":"test"}'
      const secret = 'test-secret'

      const signature = generateHmacSignature(apiKey, timestamp, body, secret)

      expect(signature).toBeDefined()
      expect(signature.length).toBe(64) // SHA256 hex output
    })

    it('should generate same signature for same inputs', () => {
      const apiKey = 'test-api-key'
      const timestamp = 1700000000
      const body = '{"data":"test"}'
      const secret = 'test-secret'

      const sig1 = generateHmacSignature(apiKey, timestamp, body, secret)
      const sig2 = generateHmacSignature(apiKey, timestamp, body, secret)

      expect(sig1).toBe(sig2)
    })

    it('should generate different signature for different body', () => {
      const apiKey = 'test-api-key'
      const timestamp = 1700000000
      const body1 = '{"data":"test1"}'
      const body2 = '{"data":"test2"}'
      const secret = 'test-secret'

      const sig1 = generateHmacSignature(apiKey, timestamp, body1, secret)
      const sig2 = generateHmacSignature(apiKey, timestamp, body2, secret)

      expect(sig1).not.toBe(sig2)
    })
  })

  describe('verifyHmacSignature', () => {
    it('should verify valid signature', () => {
      const apiKey = 'test-api-key'
      const timestamp = 1700000000
      const body = '{"data":"test"}'
      const secret = 'test-secret'

      const signature = generateHmacSignature(apiKey, timestamp, body, secret)
      const isValid = verifyHmacSignature(apiKey, timestamp, body, signature, secret)

      expect(isValid).toBe(true)
    })

    it('should reject invalid signature', () => {
      const apiKey = 'test-api-key'
      const timestamp = 1700000000
      const body = '{"data":"test"}'
      const secret = 'test-secret'
      const invalidSignature = 'invalid123456789'

      const isValid = verifyHmacSignature(apiKey, timestamp, body, invalidSignature, secret)

      expect(isValid).toBe(false)
    })

    it('should reject signature with wrong secret', () => {
      const apiKey = 'test-api-key'
      const timestamp = 1700000000
      const body = '{"data":"test"}'
      const secret1 = 'test-secret-1'
      const secret2 = 'test-secret-2'

      const signature = generateHmacSignature(apiKey, timestamp, body, secret1)
      const isValid = verifyHmacSignature(apiKey, timestamp, body, signature, secret2)

      expect(isValid).toBe(false)
    })
  })

  describe('isTimestampValid', () => {
    it('should accept current timestamp', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(isTimestampValid(now)).toBe(true)
    })

    it('should accept timestamp within drift range', () => {
      const now = Math.floor(Date.now() / 1000)
      const withinDrift = now - 100 // 100 seconds ago
      expect(isTimestampValid(withinDrift)).toBe(true)
    })

    it('should reject timestamp outside drift range', () => {
      const now = Math.floor(Date.now() / 1000)
      const outsideDrift = now - 400 // 400 seconds ago, exceeds 300s default
      expect(isTimestampValid(outsideDrift)).toBe(false)
    })

    it('should reject future timestamp outside drift range', () => {
      const now = Math.floor(Date.now() / 1000)
      const futureOutside = now + 400 // 400 seconds future
      expect(isTimestampValid(futureOutside)).toBe(false)
    })

    it('should respect custom maxDriftSeconds', () => {
      const now = Math.floor(Date.now() / 1000)
      const oldTimestamp = now - 100

      expect(isTimestampValid(oldTimestamp, 50)).toBe(false)
      expect(isTimestampValid(oldTimestamp, 200)).toBe(true)
    })
  })

  describe('sha256', () => {
    it('should produce consistent hash', () => {
      const input = 'test-input'
      const hash1 = sha256(input)
      const hash2 = sha256(input)

      expect(hash1).toBe(hash2)
      expect(hash1.length).toBe(64)
    })

    it('should produce different hash for different input', () => {
      const hash1 = sha256('input1')
      const hash2 = sha256('input2')

      expect(hash1).not.toBe(hash2)
    })
  })
})