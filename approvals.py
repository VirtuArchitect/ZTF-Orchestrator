"""
ZTF-Orchestrator — Execution Approval Gates
Operators create approval requests; admins approve or reject them.
Requests auto-expire after 24 hours. State persisted in approvals.json.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

log = logging.getLogger('ztf')

APPROVAL_TTL_HOURS = 24
MAX_STORED         = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _expires_iso() -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=APPROVAL_TTL_HOURS)
    return exp.strftime('%Y-%m-%dT%H:%M:%SZ')


class ApprovalManager:
    """Thread-safe approval gate state machine."""

    def __init__(self, approvals_file: Path, on_webhook: Callable | None = None):
        self._file       = approvals_file
        self._on_webhook = on_webhook
        self._lock       = threading.Lock()
        self._gates: dict[str, threading.Event] = {}   # id → Event (set when decided)

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> list[dict]:
        try:
            with open(self._file) as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, approvals: list[dict]):
        self._file.write_text(
            json.dumps(approvals[:MAX_STORED], indent=2), encoding='utf-8'
        )
        try:
            os.chmod(self._file, 0o600)
        except OSError:
            pass

    # ── Public API ────────────────────────────────────────────────────────────

    def list_approvals(self, status: str | None = None) -> list[dict]:
        with self._lock:
            approvals = self._load()
        self._expire_old(approvals)
        if status:
            return [a for a in approvals if a['status'] == status]
        return approvals

    def get_approval(self, aid: str) -> dict | None:
        with self._lock:
            return next((a for a in self._load() if a['id'] == aid), None)

    def create_request(
        self,
        workflow: str,
        config_file: str,
        config_content: str,
        requested_by: str,
        notes: str = '',
        pipeline_id: str | None = None,
    ) -> dict:
        """Create a new pending approval request."""
        aid = str(uuid.uuid4())
        approval = {
            'id':            aid,
            'workflow':      workflow,
            'configFile':    config_file,
            'configContent': config_content,
            'requestedBy':   requested_by,
            'requestedAt':   _now_iso(),
            'expiresAt':     _expires_iso(),
            'status':        'pending',
            'decidedBy':     None,
            'decidedAt':     None,
            'notes':         notes,
            'pipelineId':    pipeline_id,
        }
        event = threading.Event()
        with self._lock:
            approvals = self._load()
            approvals.insert(0, approval)
            self._save(approvals)
            self._gates[aid] = event

        # Auto-expire after TTL
        timer = threading.Timer(
            APPROVAL_TTL_HOURS * 3600,
            self._auto_expire, args=[aid]
        )
        timer.daemon = True
        timer.start()

        log.info('approval_created', extra={
            'action':      'approval_create',
            'approval_id': aid,
            'workflow':    workflow,
            'user':        requested_by,
        })

        if self._on_webhook:
            try:
                self._on_webhook(
                    f'approval-request:{workflow}', 'pending', 0,
                    requested_by, aid
                )
            except Exception:
                pass

        return approval

    def decide(
        self,
        aid: str,
        decision: str,      # 'approved' or 'rejected'
        decided_by: str,
        notes: str = '',
    ) -> dict | None:
        """Approve or reject a pending request."""
        if decision not in ('approved', 'rejected'):
            raise ValueError("decision must be 'approved' or 'rejected'")

        with self._lock:
            approvals = self._load()
            approval = next((a for a in approvals if a['id'] == aid), None)
            if approval is None:
                return None
            if approval['status'] != 'pending':
                return approval   # already decided
            approval['status']    = decision
            approval['decidedBy'] = decided_by
            approval['decidedAt'] = _now_iso()
            if notes:
                approval['notes'] = notes
            self._save(approvals)
            event = self._gates.get(aid)

        if event:
            event.set()

        log.info('approval_decided', extra={
            'action':      'approval_decide',
            'approval_id': aid,
            'decision':    decision,
            'user':        decided_by,
        })

        if self._on_webhook:
            try:
                self._on_webhook(
                    f'approval-{decision}:{approval["workflow"]}',
                    decision, 0, decided_by, aid
                )
            except Exception:
                pass

        return approval

    def wait_for_decision(self, aid: str, timeout: float = APPROVAL_TTL_HOURS * 3600) -> str:
        """
        Block until the approval is decided or expires.
        Returns the final status string.
        Intended for pipeline integration — call from a worker thread, not a Flask route.
        """
        event = self._gates.get(aid)
        if event:
            event.wait(timeout=timeout)
        approval = self.get_approval(aid)
        return approval['status'] if approval else 'expired'

    def delete_approval(self, aid: str) -> bool:
        with self._lock:
            approvals = self._load()
            before = len(approvals)
            approvals = [a for a in approvals if a['id'] != aid]
            if len(approvals) == before:
                return False
            self._save(approvals)
            self._gates.pop(aid, None)
        return True

    # ── Internal ──────────────────────────────────────────────────────────────

    def _auto_expire(self, aid: str):
        with self._lock:
            approvals = self._load()
            for a in approvals:
                if a['id'] == aid and a['status'] == 'pending':
                    a['status']    = 'expired'
                    a['decidedAt'] = _now_iso()
                    break
            self._save(approvals)
            event = self._gates.pop(aid, None)
        if event:
            event.set()
        log.info('approval_expired', extra={
            'action': 'approval_expire', 'approval_id': aid
        })

    def _expire_old(self, approvals: list[dict]):
        """Expire any pending approvals past their expiry date (in-place, no save)."""
        now = datetime.now(timezone.utc)
        for a in approvals:
            if a['status'] == 'pending' and a.get('expiresAt'):
                try:
                    exp = datetime.fromisoformat(a['expiresAt'].replace('Z', '+00:00'))
                    if now > exp:
                        a['status']    = 'expired'
                        a['decidedAt'] = _now_iso()
                except Exception:
                    pass
