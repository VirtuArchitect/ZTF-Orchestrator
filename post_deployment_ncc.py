"""Run a fixed NCC diagnostic using the existing ZTF SSH interpreter."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from credential_rotation import pinned_cvm_client

WORKFLOW = 'post-deployment-ncc'
COMMAND = 'LC_ALL=C ncc health_checks run_all'
TIMEOUT = 1800
MAX_OUTPUT = 2 * 1024 * 1024
ROW = re.compile(r'^\s*\|\s*([A-Za-z][A-Za-z _-]*)\s*\|\s*(\d{1,6})\s*\|\s*$')
STATES = {'pass', 'info', 'warn', 'fail', 'err', 'error', 'skip', 'skipped', 'unknown'}


def enabled():
    return os.environ.get('ZTF_POST_DEPLOYMENT_NCC_ENABLED', '').lower() == 'true'


def summarize(output, exit_code):
    counts = {}
    total = None
    for line in output.decode(errors='replace').splitlines():
        match = ROW.fullmatch(line)
        if not match:
            continue
        label, raw = match.groups()
        label = label.strip().lower()
        if total is not None:
            return {'status': 'unverified'}
        if label == 'total plugins':
            total = int(raw)
        elif label not in STATES or label in counts:
            return {'status': 'unverified'}
        else:
            counts[label] = int(raw)
    if not total or sum(counts.values()) != total or re.search(
            rb'\b(?:aborted|interrupted|incomplete)\b', output, re.IGNORECASE):
        return {'status': 'unverified'}
    clean = exit_code == 0 and counts.get('pass') == total
    return {'status': 'passed' if clean else 'findings', 'counts': counts, 'total': total}


def collect(channel, deadline):
    output = bytearray()
    while time.monotonic() < deadline:
        if channel.recv_ready():
            output.extend(channel.recv(32768))
            if len(output) > MAX_OUTPUT:
                break
        elif channel.closed or (channel.eof_received and channel.exit_status_ready()):
            return summarize(output, channel.recv_exit_status())
        else:
            time.sleep(0.1)
    return {'status': 'unverified'}


def run(python_path, node, credential, cancelled):
    # Never persist credentials or raw NCC output; the child emits counts only.
    data = json.dumps({'node': node, 'credential': credential})
    with subprocess.Popen([python_path, str(Path(__file__).resolve()), '--worker'], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True) as proc:
        try:
            try:
                output, _ = proc.communicate(data, timeout=0.5)
            except subprocess.TimeoutExpired:
                while not cancelled():
                    try:
                        output, _ = proc.communicate(timeout=1)
                        break
                    except subprocess.TimeoutExpired:
                        continue
                else:
                    return {'status': 'unverified'}
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.communicate()
    try:
        result = json.loads(output)
        if proc.returncode == 0 and result.get('status') in {'passed', 'findings', 'unverified'}:
            return result
    except (ValueError, AttributeError):
        pass
    return {'status': 'unverified'}


def worker(data):
    client = pinned_cvm_client(data['node'], data['credential'])
    try:
        with client.get_transport().open_session(timeout=15) as channel:
            channel.set_combine_stderr(True)
            channel.settimeout(5)
            channel.exec_command(COMMAND)
            return collect(channel, time.monotonic() + TIMEOUT)
    finally:
        client.close()


if __name__ == '__main__':
    try:
        if sys.argv[1:] != ['--worker']:
            raise ValueError()
        result = worker(json.loads(sys.stdin.read()))
    except Exception:
        result = {'status': 'unverified'}
    print(json.dumps(result))
