/**
 * Returns audit fields for INSERT operations.
 */
export const auditCreate = (username: string) => ({
  createdBy: username,
  createdAt: new Date(),
  updatedBy: username,
  updatedAt: new Date(),
})

/**
 * Returns audit fields for UPDATE operations.
 */
export const auditUpdate = (username: string) => ({
  updatedBy: username,
  updatedAt: new Date(),
})
