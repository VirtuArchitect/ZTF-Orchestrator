# Config files by datacenter and cluster

Updated v1.8.5-rc1 source adds configuration-file labels using the existing
credential group catalogue. This organizes files without moving, renaming or
rewriting them. Grouping is not an access boundary, credential binding or a
validation of deployment targets.

## Organize existing files

1. An administrator defines datacenter/cluster or shared-service groups under
   **Administration > Global Config > Credentials**. The same groups appear in
   **Advanced Automation > Config Files**; a second catalogue is not required.
2. Select a datacenter or cluster in the group tree. Cluster and datacenter
   views also include shared files. **All files** and **Ungrouped** retain access
   to existing files. Search matches filenames, cluster names, datacenters and
   purposes; it does not search YAML content or credentials.
3. Open a file, select **File group** and **File purpose**, then **Save grouping**.
   Purposes are Deployment, Post-configuration, Monitoring, Recovery and Shared
   template. Labels save independently of the editor's **Save** action.
4. To create or upload a file, first select its group and purpose filter. New
   files inherit those labels. An All files, Ungrouped or datacenter selection
   leaves the new file ungrouped. Existing-file uploads retain their labels and
   require confirmation before replacing content. A failed label save explicitly
   reports that the file was saved but its grouping was not.
5. Removing a group makes its files appear under Ungrouped. It does not delete
   files or change configuration references. Assign them to a new group if needed.

## Use grouped files

In a pipeline step, expand **Filter config files by datacenter / cluster**.
Choose the group, search the list, or select **Show all files**. Changing a filter
never changes an existing step's selected filename. A retained selection outside
its filter (or no longer available) is marked explicitly. Confirm file existence
and suitability before running the pipeline.

In a workflow, expand **Load a saved configuration by datacenter / cluster**.
Choose a saved file and **Load into form**. Confirm replacement of unsaved form
changes. Loading uses the same size, parsing and workflow-schema checks as
Import Config. It does not execute or approve anything. Review generated YAML,
Dry Run results, exact targets and the required approval before execution.

## Storage, permissions and recovery

Labels are stored separately as `config_organization.json` through the existing
file/PostgreSQL document backend. No database migration or new runtime dependency
is required. The existing appliance database/data backup procedure retains labels.
Individual YAML downloads contain runtime settings only; they do not include
these organizational labels.

Administrators and operators may save labels; viewers may read them. Group
catalogue management remains administrator-only. The config metadata API returns
only group definitions and config assignments, never credential assignments or
secret values. Keep all group names and labels free of confidential information.
Revision conflicts reject stale writes; reload before retrying. Corrupt metadata
fails closed rather than silently resetting. If grouping cannot load, files stay
accessible and label changes are disabled.

Physical paths, YAML bytes, existing backup history and saved pipeline, schedule,
recovery and approval references are unchanged by label saves. Deleting a config
file remains a separate action and can break references. Labels are not an ACL;
users retain their existing configuration-access permissions.

Demo grouping is simulated and held in browser memory. Repository tests and
browser checks do not prove a deployment against physical infrastructure.
