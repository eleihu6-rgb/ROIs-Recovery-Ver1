import { describe, it, expect, beforeEach } from 'vitest'
import { getTransform, registerTransform, listTransforms } from '../../transform/index.js'
import { TransformPlugin, StandardRecord } from '../../transform/base.js'

describe('Transform Registry', () => {
  beforeEach(() => {
    // Reset to default state - clear custom transforms
    const transforms = listTransforms()
    transforms.filter(t => t !== 'default').forEach(t => {
      // Note: In real implementation, would need unregister function
    })
  })

  describe('getTransform', () => {
    it('should return a transform when no identifier', () => {
      const transform = getTransform()
      expect(transform).toBeDefined()
      expect(transform.toStandard).toBeDefined()
      expect(transform.fromStandard).toBeDefined()
    })

    it('should return a transform when identifier is null', () => {
      const transform = getTransform(null)
      expect(transform).toBeDefined()
      expect(transform.toStandard).toBeDefined()
    })

    it('should return a transform for unknown identifier', () => {
      const transform = getTransform('unknown-plugin')
      expect(transform).toBeDefined()
      expect(transform.toStandard).toBeDefined()
    })

    it('should return registered transform', () => {
      const customPlugin: TransformPlugin = {
        toStandard: (raw) => ({
          recordType: 'flight',
          data: raw as Record<string, unknown>,
        }),
        fromStandard: (record) => record.data,
      }

      registerTransform('custom', customPlugin)
      const transform = getTransform('custom')
      expect(transform).toBe(customPlugin)
    })
  })

  describe('registerTransform', () => {
    it('should register new transform', () => {
      const plugin: TransformPlugin = {
        toStandard: (raw) => ({
          recordType: 'flight',
          data: { transformed: true },
        }),
        fromStandard: (record) => ({ output: true }),
      }

      registerTransform('test-plugin', plugin)
      expect(listTransforms()).toContain('test-plugin')
    })

    it('should override existing transform', () => {
      const plugin1: TransformPlugin = {
        toStandard: (raw) => ({ recordType: 'flight', data: {} }),
        fromStandard: (record) => {},
      }

      const plugin2: TransformPlugin = {
        toStandard: (raw) => ({ recordType: 'crew', data: {} }),
        fromStandard: (record) => {},
      }

      registerTransform('override-test', plugin1)
      registerTransform('override-test', plugin2)

      const transform = getTransform('override-test')
      expect(transform).toBe(plugin2)
    })
  })

  describe('listTransforms', () => {
    it('should include default transform', () => {
      const transforms = listTransforms()
      expect(transforms).toContain('default')
    })

    it('should include registered transforms', () => {
      const plugin: TransformPlugin = {
        toStandard: (raw) => ({ recordType: 'flight', data: {} }),
        fromStandard: (record) => {},
      }

      registerTransform('list-test', plugin)
      const transforms = listTransforms()
      expect(transforms).toContain('list-test')
    })
  })
})