#!/usr/bin/env python3
"""Import file-backed ZTF-Orchestrator JSON state into PostgreSQL."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from storage_backend import PostgresStorage, StorageError  # noqa: E402


DOCUMENTS = [
    'users.json',
    'settings.json',
    'history.json',
    'pipelines.json',
    'drift.json',
    'schedules.json',
    'parallel_runs.json',
    'approvals.json',
    'jobs.json',
]


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def main() -> int:
    parser = argparse.ArgumentParser(description='Import JSON state into PostgreSQL')
    parser.add_argument(
        '--data-dir',
        default=os.environ.get('ZTF_DATA_DIR', str(Path.home() / '.ztf-ui')),
        help='Directory containing ZTF-Orchestrator JSON state files',
    )
    parser.add_argument(
        '--database-url',
        default=os.environ.get('ZTF_DATABASE_URL', ''),
        help='PostgreSQL connection string',
    )
    parser.add_argument(
        '--overwrite',
        action='store_true',
        help='Overwrite existing PostgreSQL documents with local JSON values',
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f'Data directory not found: {data_dir}', file=sys.stderr)
        return 2

    try:
        storage = PostgresStorage(args.database_url)
    except StorageError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    imported = 0
    skipped = 0
    for name in DOCUMENTS:
        path = data_dir / name
        data = load_json(path)
        if data is None:
            skipped += 1
            print(f'skip missing: {name}')
            continue
        existing = storage.read_json(Path(name), None)
        if existing is not None and not args.overwrite:
            skipped += 1
            print(f'skip exists:  {name}')
            continue
        storage.write_json(Path(name), data)
        imported += 1
        print(f'imported:     {name}')

    print(f'\nImported {imported} document(s), skipped {skipped}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
