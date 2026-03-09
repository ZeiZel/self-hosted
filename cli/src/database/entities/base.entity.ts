/**
 * Base entity interface with common fields
 */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create timestamps for new entity
 */
export function createTimestamps(): Pick<BaseEntity, 'createdAt' | 'updatedAt'> {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update timestamp for entity
 */
export function updateTimestamp(): Pick<BaseEntity, 'updatedAt'> {
  return {
    updatedAt: new Date().toISOString(),
  };
}
