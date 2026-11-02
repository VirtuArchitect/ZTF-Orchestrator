export interface CredentialGroup { id: string; name: string; datacenter: string; kind: 'cluster' | 'shared' }
export interface CredentialOrganization {
  version: 1
  revision: number
  groups: CredentialGroup[]
  assignments: Record<string, { groupId: string; purpose: string }>
}
export const emptyOrganization = (): CredentialOrganization => ({ version: 1, revision: 0, groups: [], assignments: {} })

export function isCredentialOrganization(value: unknown): value is CredentialOrganization {
  if (!value || typeof value !== 'object') return false
  const org = value as CredentialOrganization
  return org.version === 1 && Number.isInteger(org.revision) && org.revision >= 0
    && Array.isArray(org.groups) && org.groups.every(group => group && typeof group.id === 'string' && typeof group.name === 'string' && typeof group.datacenter === 'string' && ['cluster', 'shared'].includes(group.kind))
    && !!org.assignments && typeof org.assignments === 'object' && !Array.isArray(org.assignments)
    && Object.values(org.assignments).every(assignment => assignment && typeof assignment.groupId === 'string' && typeof assignment.purpose === 'string')
}

/** Renaming a reference moves its labels, never its resolved value or another reference. */
export function renameAssignment(org: CredentialOrganization, previous: string, next: string): CredentialOrganization {
  if (previous === next || !Object.prototype.hasOwnProperty.call(org.assignments, previous) || Object.prototype.hasOwnProperty.call(org.assignments, next)) return org
  const assignments = { ...org.assignments }
  const assignment = assignments[previous]
  delete assignments[previous]
  return { ...org, assignments: { ...assignments, [next]: assignment } }
}
