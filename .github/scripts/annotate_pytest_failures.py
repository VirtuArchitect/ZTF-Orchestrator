"""Emit GitHub Actions annotations for pytest JUnit failures."""

from __future__ import annotations

import sys
from pathlib import Path

from defusedxml import ElementTree as ET


def _escape(value: str) -> str:
    return (
        value.replace('%', '%25')
        .replace('\r', '%0D')
        .replace('\n', '%0A')
        .replace(':', '%3A')
        .replace(',', '%2C')
    )


def main() -> int:
    report = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('pytest-results.xml')
    if not report.exists():
        print(f'pytest report not found: {report}', file=sys.stderr)
        return 0

    root = ET.parse(report).getroot()
    for case in root.iter('testcase'):
        problem = case.find('failure') or case.find('error')
        if problem is None:
            continue

        classname = case.get('classname', '')
        name = case.get('name', 'unknown')
        file_path = classname.replace('.', '/')
        if not file_path.endswith('.py'):
            file_path = f'{file_path}.py'
        if file_path.startswith('tests/'):
            path = file_path
        else:
            path = f'tests/{file_path.split("/")[-1]}'

        message = problem.get('message') or (problem.text or '').strip().splitlines()[0]
        title = f'{classname}.{name}' if classname else name
        print(f'::error file={_escape(path)},title={_escape(title)}::{_escape(message[:900])}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
