# Create Virtual Switch security review

Scope: standalone empty bridge creation using the existing PE-direct/pinned CVM SSH adapter. No new runtime dependency, public schema migration, global TLS change, default live enablement or legacy executor replacement.

Controls reviewed: admin-only endpoints; strict intent and bounded canonical plan; fixed vsN/brN name mapping; no shell strings accepted from request data; saved credential references and stdin-only SSH secrets; exact PE UUID/host membership and SSH pin inventory; per-operation TLS reason in plan/audit; independent approval bound to requester and canonical content; exact typed confirmation; worker rechecks role, approval, maintenance, cancellation and dedicated mutation gate before every create. The existing switch-operation lock serializes competing actions. Every host readback verifies an empty destination and unchanged observed source/NIC state. No forced deletion, mutation retry or rollback. Partial existing empty bridges are kept only under a fresh reviewed/approved plan.

Existing uplink migration now accepts a verified empty destination and uses its ordinary reviewed bond creation/MTU assignment; populated destinations retain their existing checks. Changed source state and uncertain writes stop later hosts and retain completed diagnostics.

Residual risk: actual manage_ovs behavior, native switch presentation and workload connectivity need representative hardware validation. Certificate exceptions leave PE server identity unauthenticated; SSH pins remain mandatory. Source/API/mocked tests cannot establish production compatibility. Live creation defaults off.
