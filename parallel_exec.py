"""
ZTF-Orchestrator — Parallel Multi-Site Execution Engine
Runs the same workflow against multiple config files concurrently
using ThreadPoolExecutor. Results stored in parallel_runs.json.
"""
from __future__ import annotations

import json
import logging
import os
import queue
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

log = logging.getLogger('ztf')

MAX_SITES       = 10    # hard cap on concurrent sites per run
MAX_STORED_RUNS = 100   # runs retained in parallel_runs.json


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class ParallelEngine:
    """Thread-safe parallel execution manager."""

    def __init__(
        self,
        runs_file: Path,
        exec_timeout: int = 3600,
        load_callback: Callable[[], list[dict]] | None = None,
        save_callback: Callable[[list[dict]], None] | None = None,
    ):
        self._file    = runs_file
        self._timeout = exec_timeout
        self._load_cb = load_callback
        self._save_cb = save_callback
        self._lock    = threading.Lock()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> list[dict]:
        if self._load_cb:
            return self._load_cb()
        try:
            with open(self._file) as f:
                return json.load(f)
        except Exception:
            return []

    def _save(self, runs: list[dict]):
        if self._save_cb:
            self._save_cb(runs[:MAX_STORED_RUNS])
            return
        self._file.write_text(
            json.dumps(runs[:MAX_STORED_RUNS], indent=2), encoding='utf-8'
        )
        try:
            os.chmod(self._file, 0o600)
        except OSError:
            pass

    # ── Public API ────────────────────────────────────────────────────────────

    def list_runs(self) -> list[dict]:
        with self._lock:
            return self._load()

    def get_run(self, run_id: str) -> dict | None:
        with self._lock:
            return next((r for r in self._load() if r['id'] == run_id), None)

    def delete_run(self, run_id: str) -> bool:
        with self._lock:
            runs = self._load()
            before = len(runs)
            runs = [r for r in runs if r['id'] != run_id]
            if len(runs) == before:
                return False
            self._save(runs)
        return True

    def submit(
        self,
        workflow: str,
        sites: list[dict],      # [{label, configContent, configFile?}]
        python_path: str,
        ztf_path: str,
        configs_dir: str,
        user: str = 'system',
        on_webhook: Callable | None = None,
    ) -> dict:
        """
        Create and immediately start a parallel run.
        Returns the run record immediately (status=running).
        Each site: {label, configContent, configFile (opt)}
        """
        if not sites:
            raise ValueError('sites must be non-empty')
        if len(sites) > MAX_SITES:
            raise ValueError(f'Maximum {MAX_SITES} sites per parallel run')

        run_id = str(uuid.uuid4())
        site_results = [
            {'label': s.get('label', f'Site {i+1}'),
             'status': 'pending', 'returnCode': None,
             'output': '', 'startedAt': None, 'finishedAt': None}
            for i, s in enumerate(sites)
        ]

        run = {
            'id':         run_id,
            'workflow':   workflow,
            'user':       user,
            'status':     'running',
            'sites':      site_results,
            'startedAt':  _now_iso(),
            'finishedAt': None,
        }

        with self._lock:
            runs = self._load()
            runs.insert(0, run)
            self._save(runs)

        # Launch async
        t = threading.Thread(
            target=self._run_all,
            args=(run_id, workflow, sites, python_path, ztf_path,
                  configs_dir, on_webhook),
            daemon=True,
        )
        t.start()
        return run

    # ── Internal execution ────────────────────────────────────────────────────

    def _run_all(
        self,
        run_id: str,
        workflow: str,
        sites: list[dict],
        python_path: str,
        ztf_path: str,
        configs_dir: str,
        on_webhook: Callable | None,
    ):
        import tempfile

        def run_site(idx: int, site: dict) -> tuple[int, int, str]:
            """Returns (idx, returncode, output)."""
            label = site.get('label', f'Site {idx+1}')
            config_content = site.get('configContent', '')

            # Write config to temp file
            try:
                with tempfile.NamedTemporaryFile(
                    mode='w', suffix='.yml',
                    dir=configs_dir, delete=False,
                    prefix=f'parallel_{run_id}_{idx}_'
                ) as tf:
                    tf.write(config_content)
                    tf_path = tf.name
            except Exception as e:
                return idx, -1, f'[FAIL] Could not write config: {e}'

            cmd = [python_path, 'main.py', f'--workflow={workflow}',
                   '-f', tf_path]
            output_lines = []

            try:
                proc = subprocess.Popen(
                    cmd, cwd=ztf_path,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1,
                )
                # Stream output with timeout
                q: queue.Queue = queue.Queue()

                def _reader():
                    for line in proc.stdout:
                        q.put(line)
                    q.put(None)

                rt = threading.Thread(target=_reader, daemon=True)
                rt.start()

                import time as _t
                deadline = _t.monotonic() + self._timeout
                while True:
                    remaining = deadline - _t.monotonic()
                    if remaining <= 0:
                        proc.kill()
                        output_lines.append('[TIMEOUT] Execution exceeded limit')
                        break
                    try:
                        line = q.get(timeout=min(remaining, 1.0))
                    except queue.Empty:
                        continue
                    if line is None:
                        break
                    output_lines.append(line.rstrip())

                proc.wait()
                rc = proc.returncode
            except Exception as e:
                rc = -1
                output_lines.append(f'[ERROR] {e}')
            finally:
                try:
                    Path(tf_path).unlink(missing_ok=True)
                except Exception:
                    pass

            return idx, rc, '\n'.join(output_lines)

        # ── Run all sites concurrently ─────────────────────────────────────
        with ThreadPoolExecutor(max_workers=min(len(sites), MAX_SITES)) as pool:
            futures = {pool.submit(run_site, i, s): i for i, s in enumerate(sites)}

            for future in as_completed(futures):
                try:
                    idx, rc, output = future.result()
                except Exception as e:
                    idx = futures[future]
                    rc, output = -1, str(e)

                status = 'success' if rc == 0 else ('failed' if rc != -1 else 'error')
                finished = _now_iso()

                with self._lock:
                    runs = self._load()
                    for run in runs:
                        if run['id'] == run_id:
                            run['sites'][idx].update({
                                'status':     status,
                                'returnCode': rc,
                                'output':     output,
                                'finishedAt': finished,
                            })
                            # Determine if we have a startedAt for this site
                            if run['sites'][idx]['startedAt'] is None:
                                run['sites'][idx]['startedAt'] = finished
                            break
                    self._save(runs)

        # ── Final overall status ───────────────────────────────────────────
        with self._lock:
            runs = self._load()
            for run in runs:
                if run['id'] == run_id:
                    statuses = [s['status'] for s in run['sites']]
                    if all(s == 'success' for s in statuses):
                        overall = 'success'
                    elif any(s in ('failed', 'error') for s in statuses):
                        overall = 'partial' if any(s == 'success' for s in statuses) else 'failed'
                    else:
                        overall = 'unknown'
                    run['status']     = overall
                    run['finishedAt'] = _now_iso()
                    final_run = run
                    break
            self._save(runs)

        if on_webhook:
            try:
                on_webhook(workflow, final_run.get('status', 'unknown'),
                           -1, 'system', run_id)
            except Exception:
                pass

        log.info('parallel_run_complete', extra={
            'action': 'parallel_execute',
            'run_id': run_id,
            'workflow': workflow,
            'sites': len(sites),
            'status': final_run.get('status'),
        })
