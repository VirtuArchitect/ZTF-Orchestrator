"""Fixed CVM commands in the existing ZTF SSH interpreter; credentials use stdin."""
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

from pe_direct import DirectError, host_ip

NIC = re.compile(r'eth[0-9]{1,3}')
BRIDGE = re.compile(r'br[0-9]{1,3}')
PIN = re.compile(r'SHA256:[A-Za-z0-9+/]{43}')
LIMIT = 1024 * 1024


def commands(action, data):
    if action == 'inspect':
        remote = ['cat /sys/class/dmi/id/product_serial', 'hostname -I',
            'ovs-vsctl --format=json --columns=_uuid,name,ports list Bridge',
            'ovs-vsctl --format=json --columns=_uuid,name,interfaces,bond_mode list Port',
            'ovs-vsctl --format=json --columns=_uuid,name,type,link_state,mac_in_use,mtu list Interface']
        return ['LC_ALL=C ssh -o BatchMode=yes -o StrictHostKeyChecking=yes root@192.168.5.1 ' + shlex.quote(cmd)
                for cmd in remote]
    bridge = data.get('bridge')
    if not isinstance(bridge, str) or not BRIDGE.fullmatch(bridge):
        raise DirectError('Invalid reviewed bridge.')
    if action == 'create' and bridge != 'br0':
        return ['LC_ALL=C manage_ovs --bridge_name ' + bridge + ' create_single_bridge']
    ports, bond, mtu = data.get('ports'), data.get('bond'), data.get('mtu')
    if (action != 'uplinks' or not isinstance(ports, list) or not 2 <= len(ports) <= 32
            or any(not isinstance(p, str) or not NIC.fullmatch(p) for p in ports)
            or len(set(ports)) != len(ports) or not isinstance(bond, str)
            or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}', bond) or type(mtu) is not int or mtu not in (1500, 9000)):
        raise DirectError('Invalid reviewed uplink command.')
    return [f'LC_ALL=C manage_ovs --bridge_name {bridge} --interfaces {",".join(sorted(ports))} '
            f'--bond_name {bond} --bond_mode active-backup --mtu {mtu} update_uplinks']


def decode(value):
    if isinstance(value, list) and len(value) == 2 and value[0] in ('uuid', 'named-uuid'):
        return value[1]
    if isinstance(value, list) and len(value) == 2 and value[0] == 'set':
        return [decode(item) for item in value[1]]
    return value


def rows(raw):
    obj = json.loads(raw)
    headings, values = obj['headings'], obj['data']
    if not isinstance(headings, list) or len(set(headings)) != len(headings) or not isinstance(values, list) or len(values) > 2048:
        raise DirectError('Unsupported OVS inventory.')
    result = []
    for row in values:
        if not isinstance(row, list) or len(row) != len(headings):
            raise DirectError('Incomplete OVS inventory.')
        result.append(dict(zip(headings, map(decode, row))))
    return result


def array(value):
    return value if isinstance(value, list) else [value]


def indexed(raw):
    values = rows(raw)
    result = {value['_uuid']: value for value in values}
    if len(result) != len(values) or len({v['name'] for v in values}) != len(values):
        raise DirectError('Duplicate OVS identities need independent review.')
    return result


def parse_inventory(output):
    serial, addresses, bridge_raw, port_raw, interface_raw = output
    serial = serial.strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,128}', serial):
        raise DirectError('AHV serial could not be verified.')
    addresses = sorted({str(ipaddress.ip_address(ip)) for ip in addresses.split()})
    ports = indexed(port_raw)
    interfaces = indexed(interface_raw)
    nics = {}
    for value in interfaces.values():
        name = value['name']
        if not NIC.fullmatch(name) or value['type'] not in ('', 'system'):
            continue
        mac, mtu = value['mac_in_use'], value['mtu']
        if not isinstance(mac, str) or not re.fullmatch(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}', mac) or type(mtu) is not int:
            raise DirectError('Physical NIC identity is incomplete.')
        nics[name] = {'name': name, 'mac': mac.lower(), 'up': value['link_state'] == 'up',
                      'mtu': mtu, 'switch': None, 'restricted': False, 'switchPort': '', 'switchDevice': ''}
    switches = {}
    for bridge in indexed(bridge_raw).values():
        bridge_name = bridge['name']
        if not BRIDGE.fullmatch(bridge_name):
            continue
        uplinks = []
        bonds = []
        for port_id in array(bridge['ports']):
            port = ports[port_id]
            physical = [interfaces[i]['name'] for i in array(port['interfaces']) if interfaces[i]['name'] in nics]
            if physical:
                bonds.append(port)
                uplinks.extend(physical)
        if len(bonds) > 1 or len(set(uplinks)) != len(uplinks):
            raise DirectError('Multiple or ambiguous physical uplink ports need independent review.')
        bond = bonds[0] if bonds else None
        bridge_interface = [v for v in interfaces.values() if v['name'] == bridge_name]
        if len(bridge_interface) != 1 or type(bridge_interface[0]['mtu']) is not int:
            raise DirectError('Bridge MTU could not be verified.')
        switches[bridge_name] = {'uuid': bridge['_uuid'], 'name': bridge_name, 'ports': sorted(uplinks),
            'bond': bond['name'] if bond else None, 'bondMode': bond['bond_mode'] if bond else None,
            'mtu': bridge_interface[0]['mtu']}
        for name in uplinks:
            if nics[name]['switch'] is not None:
                raise DirectError('Physical NIC belongs to multiple bridges.')
            nics[name]['switch'] = bridge_name
    return {'serial': serial, 'addresses': addresses, 'switches': switches,
            'nics': sorted(nics.values(), key=lambda n: n['name'])}


def worker(data):
    from credential_rotation import pinned_cvm_client
    config, node, saved = data['command'], data['node'], data['credential']
    if saved[0] != 'nutanix' or not PIN.fullmatch(node['ssh_host_key_sha256']):
        raise DirectError('Use the nutanix CVM credential and a verified SHA256 SSH host key.')
    node = {**node, 'address': host_ip(node['address'])}
    command_list = commands(data['action'], config)
    client = pinned_cvm_client(node, saved)
    try:
        output = []
        for command in command_list:
            _, stdout, stderr = client.exec_command(command, timeout=45)
            raw = stdout.read(LIMIT + 1)
            errors = stderr.read(65537)
            if len(raw) > LIMIT or len(errors) > 65536 or stdout.channel.recv_exit_status() != 0:
                raise DirectError('CVM command did not verify. Reconcile before retrying.')
            output.append(raw.decode('utf-8'))
        return {'ok': True, 'inventory': parse_inventory(output)} if data['action'] == 'inspect' else {'ok': True}
    finally:
        client.close()


def run(node, saved, action, command=None, cancelled=lambda: False):
    if cancelled():
        raise DirectError('Cancelled before CVM SSH action.')
    payload = json.dumps({'node': node, 'credential': saved, 'action': action, 'command': command or {}})
    python = os.environ.get('ZTF_PYTHON', '/opt/ztf-python/bin/python')
    with subprocess.Popen([python, str(Path(__file__).resolve()), '--worker'], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as child:
        try:
            try:
                output, _ = child.communicate(payload, timeout=1)
            except subprocess.TimeoutExpired:
                deadline = time.monotonic() + 240
                while not cancelled() and time.monotonic() < deadline:
                    try:
                        output, _ = child.communicate(timeout=1)
                        break
                    except subprocess.TimeoutExpired:
                        pass
                else:
                    raise DirectError('CVM SSH action interrupted or timed out. Reconcile before retrying.')
            if child.returncode or len(output) > LIMIT:
                raise DirectError('CVM SSH host key, credentials, connectivity or command verification failed.')
            result = json.loads(output)
            if result.get('ok') is not True:
                raise DirectError('CVM SSH action could not be verified. Check pinned host keys and connectivity; reconcile before retrying.')
            return result
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate()


if __name__ == '__main__':
    try:
        if sys.argv[1:] != ['--worker']:
            raise ValueError()
        result = worker(json.loads(sys.stdin.read(LIMIT)))
    except Exception:
        result = {'ok': False}
    print(json.dumps(result))
