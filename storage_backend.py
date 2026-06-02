from __future__ import annotations

import json
import os
import stat
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class StorageError(RuntimeError):
    pass


class FileStorage:
    name = 'file'

    def __init__(self, config_dir: Path):
        self.config_dir = config_dir

    def read_json(self, path: Path, default: Any = None) -> Any:
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except Exception:
            return default

    def write_json(self, path: Path, data: Any) -> None:
        path.write_text(json.dumps(data, indent=2), encoding='utf-8')
        try:
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass


class PostgresStorage:
    name = 'postgres'

    def __init__(self, database_url: str):
        if not database_url:
            raise StorageError('ZTF_DATABASE_URL is required when ZTF_STORAGE_BACKEND=postgres')
        try:
            import psycopg
            from psycopg.rows import dict_row
            from psycopg.types.json import Jsonb
        except ImportError as exc:
            raise StorageError(
                'PostgreSQL storage requires psycopg. Install requirements.txt or switch '
                'ZTF_STORAGE_BACKEND=file.'
            ) from exc

        self.database_url = database_url
        self._psycopg = psycopg
        self._dict_row = dict_row
        self._Jsonb = Jsonb
        self._ensure_schema()

    def _connect(self):
        return self._psycopg.connect(self.database_url, row_factory=self._dict_row)

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    create table if not exists ztf_documents (
                        name text primary key,
                        data jsonb not null,
                        updated_at timestamptz not null default now()
                    )
                    """
                )
                cur.execute(
                    """
                    create table if not exists ztf_audit_events (
                        id bigserial primary key,
                        ts timestamptz not null default now(),
                        level text not null,
                        msg text not null,
                        username text,
                        action text,
                        workflow text,
                        status text,
                        ip text,
                        event jsonb not null
                    )
                    """
                )
                cur.execute(
                    """
                    create table if not exists ztf_sessions (
                        token text primary key,
                        username text not null,
                        role text not null,
                        expires_at timestamptz not null,
                        created_at timestamptz not null default now()
                    )
                    """
                )
                cur.execute(
                    "create index if not exists idx_ztf_audit_ts on ztf_audit_events (ts desc)"
                )
                cur.execute(
                    "create index if not exists idx_ztf_audit_level on ztf_audit_events (level)"
                )
                cur.execute(
                    "create index if not exists idx_ztf_audit_username on ztf_audit_events (username)"
                )
                cur.execute(
                    "create index if not exists idx_ztf_sessions_expires on ztf_sessions (expires_at)"
                )

    @staticmethod
    def _document_name(path: Path) -> str:
        return path.name

    def read_json(self, path: Path, default: Any = None) -> Any:
        with self._connect() as conn:
            row = conn.execute(
                'select data from ztf_documents where name = %s',
                (self._document_name(path),),
            ).fetchone()
        return row['data'] if row else default

    def write_json(self, path: Path, data: Any) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                insert into ztf_documents (name, data, updated_at)
                values (%s, %s, now())
                on conflict (name) do update
                set data = excluded.data,
                    updated_at = now()
                """,
                (self._document_name(path), self._Jsonb(data)),
            )

    def append_audit_event(self, event: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                insert into ztf_audit_events
                    (level, msg, username, action, workflow, status, ip, event)
                values
                    (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(event.get('level', 'INFO')),
                    str(event.get('msg', '')),
                    event.get('user'),
                    event.get('action'),
                    event.get('workflow'),
                    event.get('status'),
                    event.get('ip'),
                    self._Jsonb(event),
                ),
            )

    def read_audit_events(
        self,
        limit: int = 200,
        level: str = '',
        user: str = '',
        action: str = '',
    ) -> list[dict]:
        clauses = []
        params: list[Any] = []
        if level:
            clauses.append('upper(level) = %s')
            params.append(level.upper())
        if user:
            clauses.append('lower(username) = %s')
            params.append(user.lower())
        if action:
            clauses.append("(lower(msg) like %s or lower(coalesce(action, '')) like %s)")
            needle = f'%{action.lower()}%'
            params.extend([needle, needle])
        where = f"where {' and '.join(clauses)}" if clauses else ''
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                select event
                from ztf_audit_events
                {where}
                order by id desc
                limit %s
                """,
                params,
            ).fetchall()
        return [row['event'] for row in reversed(rows)]

    def create_session(self, token: str, username: str, role: str, expires_at: datetime) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                insert into ztf_sessions (token, username, role, expires_at)
                values (%s, %s, %s, %s)
                on conflict (token) do update
                set username = excluded.username,
                    role = excluded.role,
                    expires_at = excluded.expires_at
                """,
                (token, username, role, expires_at),
            )

    def get_session(self, token: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                select username, role, expires_at
                from ztf_sessions
                where token = %s
                  and expires_at > now()
                """,
                (token,),
            ).fetchone()
            if not row:
                conn.execute('delete from ztf_sessions where token = %s', (token,))
                return None
        return {'username': row['username'], 'role': row['role'], 'expires': row['expires_at']}

    def invalidate_session(self, token: str) -> None:
        with self._connect() as conn:
            conn.execute('delete from ztf_sessions where token = %s', (token,))

    def purge_expired_sessions(self) -> None:
        with self._connect() as conn:
            conn.execute('delete from ztf_sessions where expires_at <= now()')

    def cleanup_retention(self, audit_days: int = 90, execution_days: int = 180) -> None:
        with self._connect() as conn:
            if audit_days > 0:
                conn.execute(
                    "delete from ztf_audit_events where ts < now() - (%s::text || ' days')::interval",
                    (audit_days,),
                )
        self.purge_expired_sessions()
        if execution_days > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(days=execution_days)
            self._prune_document_list('history.json', cutoff, ('timestamp', 'startedAt', 'createdAt'))
            self._prune_document_list('drift.json', cutoff, ('timestamp',))
            self._prune_document_list('approvals.json', cutoff, ('requestedAt', 'decidedAt'))
            self._prune_document_list('parallel_runs.json', cutoff, ('startedAt', 'finishedAt'))

    def _prune_document_list(self, name: str, cutoff: datetime, date_keys: tuple[str, ...]) -> None:
        data = self.read_json(Path(name), [])
        if not isinstance(data, list):
            return

        def keep(item: dict) -> bool:
            if not isinstance(item, dict):
                return True
            for key in date_keys:
                value = item.get(key)
                if not value:
                    continue
                try:
                    parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
                    return parsed >= cutoff
                except ValueError:
                    continue
            return True

        pruned = [item for item in data if keep(item)]
        if len(pruned) != len(data):
            self.write_json(Path(name), pruned)


def create_storage(config_dir: Path) -> FileStorage | PostgresStorage:
    backend = os.environ.get('ZTF_STORAGE_BACKEND', 'file').strip().lower()
    if backend in ('', 'file', 'json'):
        return FileStorage(config_dir)
    if backend in ('postgres', 'postgresql', 'pg'):
        return PostgresStorage(os.environ.get('ZTF_DATABASE_URL', ''))
    raise StorageError(f'Unsupported ZTF_STORAGE_BACKEND: {backend}')
