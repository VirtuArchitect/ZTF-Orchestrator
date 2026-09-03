# Limitations

Current release marker: `v1.8.0`.

This document records current product and validation limits that matter for
operator-controlled or production-assessable use.

## Current Limits

- Workflows 1.x and Scripts 1.x execution target legacy ZeroTouch Framework 1.x.
- ZTF 2.x plan/apply is available only through the separate guarded ZTF 2.x IaC,
  Workflows 2.x, and Scripts 2.x lanes.
- Ungoverned ZTF 2.x apply/destroy and live resource behavior without
  environment-specific UAT remain out of scope.
- YAML Studio does not execute workflows or mutate infrastructure.
- NKP apply/destructive behavior remains constrained.
- Production validation is environment-specific.
- Foundation Central create/imaging requires its own UAT lane.
- Native Foundation deployment is planning-only. It validates intent shape for
  multi-site, heterogeneous hardware and HCI/compute-only/storage-only cluster
  types, including named credential reference metadata and post-create
  validation payload previews and future secret resolution and binding requests, but does
  not resolve secrets, authenticate to providers, execute imaging, form
  clusters, contact Prism Element, or validate live cluster state in this
  release. Execution admission review is also read-only and cannot schedule or
  start deployment. Execution adapter contract review cannot load provider code
  or start adapter jobs. Execution request review cannot enqueue work or create
  a background job. Dry-run execution ledger review records planned graph steps
  and expected evidence outputs only; it cannot execute adapters or submit jobs.
  Secret-store binding review cannot open leases, read stores, expose secret
  paths, authenticate providers, or hand credentials to adapters.
  Secret-store provider contract review cannot approve providers, persist
  provider configuration, authenticate, open leases, read paths, resolve values,
  or hand credentials to adapters.
  Execution permit review cannot issue permits, persist authorization, load
  adapters, or submit jobs. Execution lock plan review cannot acquire locks,
  write lock records, or reserve deployment windows. Execution audit plan review
  cannot append audit events, retain evidence artifacts, export evidence ZIPs,
  or write hash manifests. Execution retention plan review cannot persist
  retention policies, create backups, restore state, export retained evidence,
  or validate replay. Runner readiness review cannot start jobs, issue permits,
  acquire locks, resolve secrets, load adapters, or mutate hardware.
  Controlled UAT entry review cannot authorize hardware testing, load adapters,
  start jobs, resolve secrets, or call Foundation.
  Controlled UAT scope review cannot reserve hardware, authorize UAT, load
  adapters, start jobs, resolve secrets, or mutate infrastructure.
  Controlled UAT runbook review cannot approve UAT, reserve hardware, persist
  operator signoff, load adapters, start jobs, or resolve secrets.
  Controlled UAT security review cannot approve UAT, persist security signoff,
  enable adapters, resolve secrets, or start jobs.
  Controlled UAT operations review cannot approve UAT, reserve windows, persist
  change tickets, acquire locks, start jobs, or mutate hardware.
  Controlled UAT signoff review cannot persist signoff, issue controlled UAT
  entry, enable adapters, load adapter code, start jobs, or mutate hardware.
  Recovery plan review cannot pause jobs, retry adapters,
  roll back hardware, or execute recovery commands. Job state planning cannot
  create durable records, acquire locks, persist checkpoints, or replay work.
  Native Foundation review jobs can persist read-only logs and history, but
  they cannot run deployment adapters, contact Foundation or Prism Element, or
  mutate hardware. Adapter UAT rehearsal plans define cases and expected
  artifacts only; they cannot execute UAT or promote adapters. Adapter
  activation review cannot change registry status, load adapter code, or enable
  deployment execution. Adapter enablement registry review can draft disabled
  provider/deployment registry entries only; it cannot persist registry changes,
  load adapters, or enable mutation.
  Adapter allow-list review can draft approval artifacts only; it cannot persist
  allow-list entries, load adapters, enable mutation, or start jobs.
  Adapter load plan review can draft not-loaded adapter entries only; it cannot
  read adapter packages, import modules, instantiate adapters, hand off
  credentials, start runners, or mutate hardware.
  Adapter package provenance review can record package references and SHA256
  metadata only; it cannot read packages, hash bytes, verify signatures, stage
  files, import code, instantiate adapters, or mutate hardware.
  Adapter SBOM review can record SBOM references, supported format metadata,
  SHA256 metadata, and vulnerability scan references only; it cannot generate
  SBOMs, read SBOMs, parse component inventories, run vulnerability scans,
  stage packages, import code, instantiate adapters, or mutate hardware.
  Adapter runtime isolation review can record runtime owner, isolation profile,
  sandbox image, network policy, and filesystem policy references only; it
  cannot create sandboxes, pull images, mount packages, apply policies,
  register hooks, hand credentials to adapters, start adapter processes, or
  mutate hardware.
  Adapter runtime admission review can record admission owner, approval
  reference, change ticket, and exception reference only; it cannot admit
  runtimes, load adapters, hand credentials to adapters, submit mutating jobs,
  call Foundation, contact Prism Element, contact BMCs, or mutate hardware.
  Adapter execution preflight review can record preflight owner, evidence,
  adapter command, target connectivity, and rollback readiness references only;
  it cannot run commands, resolve secrets, open target connections, call
  Foundation, contact Prism Element, contact BMCs, contact hardware providers,
  submit mutating jobs, or mutate hardware.
  Adapter target connectivity review can record connectivity owner, scope,
  target allow-list, maintenance window, and probe plan references only; it
  cannot open sockets, authenticate, resolve secrets, run reachability probes,
  call Foundation, contact Prism Element, contact BMCs, contact hardware
  providers, submit mutating jobs, or mutate hardware.
  Secret lease execution review can record lease owner, policy, audit sink,
  adapter identity, revocation, provider contract, and binding references only;
  it cannot authenticate to a secret store, open leases, read paths, resolve
  values, persist secret audit events, hand credentials to adapters, revoke
  live leases, submit mutating jobs, or mutate hardware.
  Secret audit persistence review can record audit owner, policy, sink,
  retention, failure-classification, lease execution, provider contract, and
  binding references only; it cannot append audit events, persist audit trails,
  write retained artifacts, read retained secret material, classify live
  failures, submit mutating jobs, or mutate hardware.
  Adapter credential handoff review can record handoff owner, credential
  handoff, secret lease policy, adapter identity, and redaction policy
  references only; it cannot open leases, resolve secrets, decrypt values,
  expose secret material, hand credentials to adapters, open target
  connections, submit mutating jobs, or mutate hardware.
  Adapter command invocation review can record command owner, command catalog,
  invocation policy, execution identity, and output capture references only; it
  cannot assemble commands, write command files, invoke adapters, start
  processes, open target connections, resolve secrets, capture live output,
  submit mutating jobs, or mutate hardware.
  Adapter output evidence review can record output evidence owner, retention,
  artifact redaction, failure classification, and evidence-store references
  only; it cannot capture stdout or stderr, write artifacts, persist validation
  evidence, classify live failures, export retained evidence, submit mutating
  jobs, or mutate hardware.
  Retained evidence export review can record export owner, private export
  request, retention store, RBAC review, checksum manifest, retention plan, and
  output evidence references only; it cannot read retained artifacts, generate
  ZIPs, write checksum manifests, persist validation evidence, export retained
  evidence, submit mutating jobs, or mutate hardware.
- Prism Central category mutation had prior service-readiness limitations and
  should not be overclaimed without fresh target evidence.
- Disaster recovery requires deployment-specific RPO/RTO acceptance.

## Evidence Rule

Every capability claim must map to repository tests, simulator evidence, lab
evidence, controlled UAT evidence, or production validation evidence.
