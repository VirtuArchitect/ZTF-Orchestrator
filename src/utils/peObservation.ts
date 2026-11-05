/** Presentation of appliance evidence. Browser wall time never determines freshness. */
export type PEObservation = { status: string; collectedAt: string; completedAt?: string; collectionStatus?: string; message: string; checks: { name: string; status: string }[] }
export type ObservationRecord = { observationFresh?: boolean; observation?: PEObservation; observationDiagnostics?: { state: string; ageSeconds: number | null; ttlSeconds: number; message: string } }
export type ObservationSnapshot = { collectedAt: string; clientReceivedAt?: number }

function timestamp(value?: string) {
  return value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN
}
function elapsed(snapshot?: ObservationSnapshot) {
  return snapshot?.clientReceivedAt === undefined ? 0 : Math.max(0, performance.now() - snapshot.clientReceivedAt)
}
export function observationAge(cluster: ObservationRecord, snapshot?: ObservationSnapshot) {
  const age = timestamp(snapshot?.collectedAt) - timestamp(cluster.observation?.collectedAt) + elapsed(snapshot)
  return Number.isFinite(age) ? age / 1000 : null
}
export function observationState(cluster: ObservationRecord, snapshot?: ObservationSnapshot) {
  if (!cluster.observation) return 'not_checked'
  const age = observationAge(cluster, snapshot)
  if (age === null) return 'invalid_timestamp'
  if (age < 0) return 'clock_mismatch'
  if (cluster.observation.collectionStatus === 'failed') return 'collection_failed'
  if (age > 900) return 'expired'
  if (cluster.observation.collectionStatus === 'not_attempted' || cluster.observationFresh !== true) return 'unknown'
  return 'fresh'
}
export function freshObservation(cluster: ObservationRecord, snapshot?: ObservationSnapshot) {
  return observationState(cluster, snapshot) === 'fresh'
}
export function healthLabel(cluster: ObservationRecord, unavailable = false, snapshot?: ObservationSnapshot) {
  if (unavailable) return 'Dashboard refresh failed'
  const state = observationState(cluster, snapshot)
  const labels: Record<string, string> = { not_checked: 'Not checked', expired: 'Evidence expired', collection_failed: 'Collection failed', clock_mismatch: 'Evidence clock mismatch', invalid_timestamp: 'Invalid evidence timestamp', unknown: 'Unknown / review required' }
  if (state !== 'fresh') return labels[state]
  return cluster.observation?.status === 'good' ? 'PE-reported health: Good' : cluster.observation?.status === 'not_good' ? 'PE-reported health needs attention' : 'Unknown / review required'
}
export function evidenceAgeLabel(cluster: ObservationRecord, snapshot?: ObservationSnapshot) {
  const age = observationAge(cluster, snapshot)
  if (age === null) return 'Evidence age unavailable; collect a timestamped PE readback.'
  const duration = `${Math.floor(Math.abs(age) / 60)}m ${Math.floor(Math.abs(age) % 60)}s`
  if (age < 0) return `Evidence timestamp is ${duration} ahead of appliance time.`
  return `Evidence age: ${duration} (appliance time); ${age > 900 ? '15-minute window expired' : '15-minute window'}.`
}
export function clockWarning(snapshot?: ObservationSnapshot) {
  const server = timestamp(snapshot?.collectedAt)
  const skew = Date.now() - server - elapsed(snapshot)
  if (!Number.isFinite(skew) || Math.abs(skew) <= 60_000) return ''
  return `Browser/appliance clock mismatch: browser is about ${Math.round(Math.abs(skew) / 60_000)} minute(s) ${skew > 0 ? 'ahead' : 'behind'}. Check workstation and appliance time/NTP. Evidence age uses appliance timestamps; the browser clock does not invalidate a fresh PE result.`
}
