import { api } from './api'
import type { DictionaryItem } from '@/types'

export const dictionaryApi = {
  /** Get dictionary items by parent code */
  async getByParentCode(parentCode: string): Promise<DictionaryItem[]> {
    return api.get(`/api/dictionary/parent/${parentCode}`) as Promise<DictionaryItem[]>
  },
}
