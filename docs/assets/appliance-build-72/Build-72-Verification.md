# Build #72: Foundation VM deployment enabled by default

Source: f9eee7e5b7c15610b4f463818bda364c907e4fd3 (merged PR #239).
Build run: https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316

All three build jobs passed. Each downloaded QCOW2 matched its published SHA-256 and passed qemu-img consistency checks. Original images were mounted read-only, with all test state confined to disposable overlays. Factory bootstrap was unmodified: the test seed supplied only a temporary Linux SSH account, not application settings or replacement bootstrap code.

| Profile | Artifact | First boot/default | Real HTTP guards | QCOW2 SHA-256 |
|---|---|---|---|---|
| standard | [Download](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316/artifacts/15140012194) | Passed | 12 passed | `a28e6c2b3f52148c6942793090211e5914e84ad0f438ac625295b4a2996ef084` |
| airgap | [Download](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316/artifacts/15139016921) | Passed | 12 passed | `37e9ae056b43ca1cee6cdd6c1ce4f00492cce0705545287ccffd85eb5c0a0d8e` |
| minimal | [Download](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316/artifacts/15137946073) | Passed | 12 passed | `85e39bfaea7c84e0b44fde7b0fb06e1b1024ff945454064bb918480ea47e6695` |
Each actual downloaded appliance completed its systemd first boot, ran healthy Docker/PostgreSQL services, reported the expected source/versioned image identity and persisted ZTF_FOUNDATION_VM_ENABLE_MUTATION=true in its private .env. Repeating first boot retained its configuration, approval records and application/database containers.

Twelve real HTTP checks per appliance (36 total) verified:

- Unauthenticated execution returns HTTP 401.
- Missing or non-exact deployment confirmation returns HTTP 403.
- Missing configured approval or a pending approval returns HTTP 403.
- Creating a synthetic approval request returns HTTP 201.
- Self-approval returns HTTP 403.
- Approval by a different administrator succeeds with HTTP 200.
- An approved request still cannot bypass exact confirmation: HTTP 403.
- Changing approved YAML intent returns HTTP 403.
- Operator and Viewer execution attempts return HTTP 403 before approval processing.

No request combined valid confirmation with an approved matching intent for execution. The real jobs API remained empty and approved records had no linked job. Synthetic references and documentation-range addresses were used, with no real cluster credentials. Standard and Airgap had no outbound network. Minimal used public registries during first boot; outbound public access was blocked before API verification. Existing local Orchestrator and PostgreSQL containers were unchanged.

Boundary: testing used disposable QEMU/KVM guests, not an import into AHV or a physical cluster deployment. No Foundation imaging, PE/PC registration or live cluster change was performed. These remain release-candidate images; configured approvals, administrator-only deployment and exact DEPLOY FOUNDATION VM confirmation are still required. Image-upload enablement is separate.

Downloads require GitHub sign-in and are subject to GitHub Actions artifact retention. Each artifact contains its own checksum file; local copies and the consolidated checksum list are retained alongside this report. Old Build #71 downloads and existing VMs are not modified by this rebuild.
