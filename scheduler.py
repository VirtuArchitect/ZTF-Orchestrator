"""
ZTF-Orchestrator — Scheduled Execution Engine
Persists schedules to schedules.json. Uses APScheduler if available;
falls back to a threading.Timer-based polling loop otherwise.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

log = logging.getLogger('ztf')

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger
    _APScheduler = BackgroundScheduler
    _CronTrigger = CronTrigger
    APSCHEDULER_AVAILABLE = True
except ImportError:
    APSCHEDULER_AVAILABLE = False

# ── Model ─────────────────────────────────────────────────────────────────────
# Each schedule dict:
# {
#   id, name, workflow, script (opt), configFile (opt), configContent (opt),
#   cronExpr, enabled, createdAt, nextRun, lastRun (opt), lastStatus (opt)
# }

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class ScheduleEngine:
    """Thread-safe scheduled execution manager."""

    def __init__(self, schedules_file: Path, run_callback: Callable):
        self._file = schedules_file
        self._run_cb = run_callback          # called with (schedule_dict) on fire
        self._lock   = threading.Lock()
        self._sched  = None
        self._poll_timer: threading.Timer | None = None

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> list[dict]:
        try:
            with open(self._file) as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, schedules: list[dict]):
        self._file.write_text(json.dumps(schedules, indent=2), encoding='utf-8')
        try:
            os.chmod(self._file, 0o600)
        except OSError:
            pass

    # ── Public CRUD ───────────────────────────────────────────────────────────

    def list_schedules(self) -> list[dict]:
        with self._lock:
            return self._load()

    def get_schedule(self, sid: str) -> dict | None:
        with self._lock:
            return next((s for s in self._load() if s['id'] == sid), None)

    def create_schedule(self, payload: dict) -> dict:
        sid = str(uuid.uuid4())
        schedule = {
            'id':            sid,
            'name':          payload.get('name', 'Unnamed Schedule'),
            'workflow':      payload.get('workflow', ''),
            'script':        payload.get('script', ''),
            'configFile':    payload.get('configFile', ''),
            'configContent': payload.get('configContent', ''),
            'cronExpr':      payload.get('cronExpr', '0 * * * *'),
            'enabled':       bool(payload.get('enabled', True)),
            'createdAt':     _now_iso(),
            'nextRun':       None,
            'lastRun':       None,
            'lastStatus':    None,
        }
        with self._lock:
            schedules = self._load()
            schedules.append(schedule)
            self._save(schedules)
        if schedule['enabled']:
            self._register_job(schedule)
        return schedule

    def update_schedule(self, sid: str, payload: dict) -> dict | None:
        with self._lock:
            schedules = self._load()
            idx = next((i for i, s in enumerate(schedules) if s['id'] == sid), None)
            if idx is None:
                return None
            for k in ('name', 'workflow', 'script', 'configFile', 'configContent',
                      'cronExpr', 'enabled'):
                if k in payload:
                    schedules[idx][k] = payload[k]
            self._save(schedules)
            schedule = schedules[idx]
        self._unregister_job(sid)
        if schedule.get('enabled'):
            self._register_job(schedule)
        return schedule

    def delete_schedule(self, sid: str) -> bool:
        self._unregister_job(sid)
        with self._lock:
            schedules = self._load()
            before = len(schedules)
            schedules = [s for s in schedules if s['id'] != sid]
            if len(schedules) == before:
                return False
            self._save(schedules)
        return True

    def run_now(self, sid: str) -> bool:
        schedule = self.get_schedule(sid)
        if not schedule:
            return False
        t = threading.Thread(target=self._fire, args=(schedule,), daemon=True)
        t.start()
        return True

    # ── APScheduler integration ───────────────────────────────────────────────

    def start(self):
        """Start the background scheduler and restore all enabled jobs."""
        if APSCHEDULER_AVAILABLE:
            self._sched = _APScheduler(daemon=True)
            self._sched.start()
            with self._lock:
                schedules = self._load()
            for s in schedules:
                if s.get('enabled'):
                    self._register_job(s)
            log.info('scheduler_start', extra={'action': 'scheduler_start',
                     'jobs': sum(1 for s in schedules if s.get('enabled'))})
        else:
            log.warning('scheduler_start', extra={'action': 'scheduler_degraded',
                'msg': 'APScheduler not installed — using polling fallback'})
            self._start_poll_loop()

    def shutdown(self):
        """Gracefully shut down the scheduler."""
        if self._sched:
            try:
                self._sched.shutdown(wait=False)
            except Exception:
                pass
        if self._poll_timer:
            self._poll_timer.cancel()

    def _register_job(self, schedule: dict):
        if not APSCHEDULER_AVAILABLE or not self._sched:
            return
        try:
            parts = schedule['cronExpr'].strip().split()
            if len(parts) != 5:
                return
            minute, hour, day, month, day_of_week = parts
            trigger = _CronTrigger(
                minute=minute, hour=hour, day=day,
                month=month, day_of_week=day_of_week,
                timezone='UTC',
            )
            self._sched.add_job(
                self._fire,
                trigger=trigger,
                args=[schedule],
                id=schedule['id'],
                name=schedule['name'],
                replace_existing=True,
                misfire_grace_time=300,
            )
        except Exception as e:
            log.error('schedule_register_error', extra={'action': 'schedule_register',
                      'schedule_id': schedule['id'], 'error': str(e)})

    def _unregister_job(self, sid: str):
        if not APSCHEDULER_AVAILABLE or not self._sched:
            return
        try:
            self._sched.remove_job(sid)
        except Exception:
            pass

    # ── Polling fallback (no APScheduler) ────────────────────────────────────

    def _start_poll_loop(self):
        self._poll_timer = threading.Timer(60.0, self._poll_tick)
        self._poll_timer.daemon = True
        self._poll_timer.start()

    def _poll_tick(self):
        """Called every ~60 s. Fires any enabled schedule whose cron matches now."""
        try:
            now = datetime.now(timezone.utc)
            with self._lock:
                schedules = self._load()
            for s in schedules:
                if s.get('enabled') and _cron_matches(s.get('cronExpr', ''), now):
                    threading.Thread(target=self._fire, args=(s,), daemon=True).start()
        except Exception:
            pass
        self._start_poll_loop()   # re-schedule

    # ── Execution callback ────────────────────────────────────────────────────

    def _fire(self, schedule: dict):
        """Run the scheduled workflow and update lastRun / lastStatus."""
        log.info('schedule_fire', extra={
            'action': 'schedule_fire',
            'schedule_id': schedule['id'],
            'name': schedule['name'],
        })
        try:
            status = self._run_cb(schedule)
        except Exception as e:
            status = 'error'
            log.error('schedule_error', extra={
                'action': 'schedule_fire', 'error': str(e),
                'schedule_id': schedule['id'],
            })
        # Update lastRun and lastStatus in the persisted record
        with self._lock:
            schedules = self._load()
            for s in schedules:
                if s['id'] == schedule['id']:
                    s['lastRun']    = _now_iso()
                    s['lastStatus'] = status
                    break
            self._save(schedules)


def _cron_matches(expr: str, dt: datetime) -> bool:
    """Minimal cron matcher for the polling fallback (5-field standard cron)."""
    try:
        parts = expr.strip().split()
        if len(parts) != 5:
            return False
        minute, hour, dom, month, dow = parts

        def _match(field: str, value: int, lo: int, hi: int) -> bool:
            if field == '*':
                return True
            if '/' in field:
                start, step = field.split('/', 1)
                start = lo if start == '*' else int(start)
                return (value - start) % int(step) == 0
            if ',' in field:
                return value in (int(x) for x in field.split(','))
            if '-' in field:
                a, b = field.split('-', 1)
                return int(a) <= value <= int(b)
            return value == int(field)

        return (
            _match(minute, dt.minute,     0, 59) and
            _match(hour,   dt.hour,       0, 23) and
            _match(dom,    dt.day,        1, 31) and
            _match(month,  dt.month,      1, 12) and
            _match(dow,    dt.weekday(),  0,  6)
        )
    except Exception:
        return False
