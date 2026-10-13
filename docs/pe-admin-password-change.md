# Prism Element Admin Password Change

The installed ZTF 1.x script `ChangeDefaultAdminPasswordPe` is exposed under
Scripts > Prism Element and in the pipeline step selector. It changes the PE
`admin` password, not AHV root, CVM nutanix, or iDRAC credentials.

1. Create a separate credential reference for the new PE admin password in Global
   Config. Retain the existing reference until the change is verified.
2. In Scripts, select Change Default Admin Password (PE). Enter the PE VIP,
   cluster name, existing PE credential reference, and new PE admin credential
   reference. An optional masked existing-password override is available; leaving
   it blank uses the upstream shipped default.
3. Generate and review the YAML. An override is stored in that YAML when supplied;
   protect the editor, downloads and saved file as sensitive material. The new
   password remains a reference rather than a literal in the generated config.
4. Run the script with the exact confirmation `RUN ChangeDefaultAdminPasswordPe`.
   Verify successful login using the new password in Prism. Upstream verification
   alone is not proof: a failed request with the old password can be interpreted
   as success by the upstream script.
5. Update the credential reference used by subsequent cluster workflows. The
   script does not automatically modify saved Orchestrator credentials.

For pipelines, save the generated YAML in Config Files, add Change Default Admin
Password (PE) (Script), and select that file. Run confirmation is required each
time and is not persisted in the pipeline. The step uses `--script`, while normal
workflow steps continue to use `--workflow`. A failed step stops subsequent steps;
ZTF ERROR/CRITICAL output also fails the password step even with exit code zero.
Do not automatically retry a password change after an ambiguous network failure.

Do not chain this standalone action before Configure Cluster: that workflow also
attempts the initial password change. Use its corrected native form for a combined
initial configuration; see [Initial Cluster Configuration](cluster-initial-configuration.md).

Subsequent steps must already reference the new credential, or be run separately
after verifying the password and updating the saved reference. Mandatory approval
policy cannot be bypassed through a pipeline: approval-required actions must use
the direct job path with an approval ID.

Validation includes mocked execution and browser tests. No real cluster password
is changed by those checks; environment-specific validation remains required.
