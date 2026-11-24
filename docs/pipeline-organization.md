# Organise pipelines by datacenter and cluster

Updated source builds add the same Global Config group catalogue to Pipelines.
This is logical organisation, not a permission boundary or a target override.
Existing pipeline IDs, steps, YAML, approvals, completed work and recovery history remain intact.

1. In **Administration > Global Config**, create or review your datacenter and cluster groups.
2. Open **Pipelines** and select a datacenter, then its cluster in **Datacenters & clusters**.
3. Choose **New Pipeline**. The selected cluster is preselected in **Datacenter / cluster**.
4. Name the pipeline and add its reviewed workflows/scripts in order. Configuration file choices initially show the selected cluster and shared files. Expand the file filter to choose a different scope if needed.
5. Check the actual targets and credential references in each YAML. A group label never rewrites a YAML or authenticates to a cluster.
6. Choose **Create Pipeline**. Saving does not execute it. The list shows its saved group.
7. To organise an existing pipeline, choose **Edit pipeline**, select its group, and choose **Update Pipeline**. Existing configuration selections are retained even outside the new file filter.

**All pipelines** lists every pipeline. **Ungrouped** includes older pipelines and pipelines whose group was removed. Shared groups have their own view. Search matches pipeline names, datacenters, clusters and step filenames. Datacenter views include pipelines assigned to their cluster groups.

The selected view is stored in the URL so it can be bookmarked. If grouping is unavailable, existing pipelines remain accessible and assignment controls are disabled; use **Reload groups** to retry. Stale group assignments are rejected when newly selected; an unchanged removed assignment can be retained or cleared.

## Compatibility and access

The existing pipeline CRUD API accepts an optional `groupId` string referencing a Global Config group, or an empty string for Ungrouped. Older clients and records work without the field. No database migration or new runtime dependency is needed. Existing admin/operator editing permissions and viewer read access apply.

Groups are not access-control partitions. Execution still uses the existing pipeline and action approvals, YAML targets, authentication, verification and recovery controls, including the eligible registration-only recovery retry. Grouping does not confer permission to execute a workflow.
