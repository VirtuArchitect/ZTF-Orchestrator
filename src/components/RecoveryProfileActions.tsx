export type ProfileLifecycle = {
  canEdit: boolean; canArchive: boolean; canRestore: boolean; canDelete: boolean
  editReason: string; archiveReason: string; restoreReason: string; deleteReason: string
  blockers: { id: string; status: string }[]; runCount: number; linkedClusterCount: number | null
}

export type ProfileAction = 'archive' | 'restore' | 'delete'

export default function RecoveryProfileActions({ profile, admin, busy, review, edit, action, openRun }: {
  profile: { name: string; archivedAt?: string; lifecycle?: ProfileLifecycle }
  admin: boolean; busy: boolean; review: () => void; edit: () => void
  action: (action: ProfileAction) => void; openRun: (id: string) => void
}) {
  const lifecycle = profile.lifecycle
  const reason = !lifecycle ? 'Reload profile permissions before making changes.' : lifecycle.editReason || lifecycle.archiveReason || lifecycle.restoreReason
  return <div className="min-w-[250px] space-y-2">
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" disabled={busy} onClick={review}>Review Profile</button>
      {admin && <>
        <button className="btn-secondary" disabled={busy || !lifecycle?.canEdit} aria-label={`Edit profile ${profile.name}`} onClick={edit}>Edit Profile</button>
        <button className="btn-secondary" disabled={busy || !(profile.archivedAt ? lifecycle?.canRestore : lifecycle?.canArchive)} aria-label={`${profile.archivedAt ? 'Restore' : 'Archive'} profile ${profile.name}`} onClick={() => action(profile.archivedAt ? 'restore' : 'archive')}>{profile.archivedAt ? 'Restore Profile' : 'Archive Profile'}</button>
        <button className="btn-secondary" disabled={busy || !lifecycle?.canDelete} aria-label={`Delete unused profile ${profile.name}`} onClick={() => action('delete')}>Delete Unused Profile</button>
      </>}
    </div>
    {admin && reason && <p className="text-xs text-amber-400">{reason}</p>}
    {admin && lifecycle?.blockers.map(run => <button key={run.id} className="block text-xs text-nutanix-cyan" onClick={() => openRun(run.id)}>Review blocking run {run.id} · {run.status.replace(/_/g, ' ')}</button>)}
    {admin && lifecycle?.deleteReason && <p className="text-xs text-gray-400">{lifecycle.deleteReason}</p>}
  </div>
}
