# Console integration retirement

ZTF 1.x remains the pipeline executor. Saved pipelines using the retired Native
executor stay visible and are blocked from execution. An administrator can edit
and review the actions and YAML, then explicitly convert the pipeline. Existing
recovery run snapshots and the step 08 registration retry retain their approval
and evidence requirements.

NKP and ZTF 2.x setup and execution are retired in the console. Existing data is
retained. Validation Evidence remains available for ZTF packs and historical
downloads. Administrators reviewing migration dependencies can also inspect
saved NKP profiles and binaries through their authenticated read endpoints and
review historical jobs and approvals in the console. This phase retains
integration code and the baked runtime for rollback and inspection. Removal of
stored records or runtime dependencies is a separate phase after inventory review.
