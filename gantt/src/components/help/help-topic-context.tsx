import { createContext, useContext } from 'react'

export const ActiveHelpTopicContext = createContext<string | null>(null)

export const useActiveHelpTopic = (): string => {
  const slug = useContext(ActiveHelpTopicContext)
  if (!slug) throw new Error('Menu Help topic rendered without an active slug')
  return slug
}
