const { test } = require('node:test');
const assert = require('node:assert/strict');
const { documentationAddresses: normalise } = require('../scripts/documentation/example-addresses.cjs');

test('illustrative targets and DNS use only TEST-NET ranges', () => {
  assert.equal(normalise('10.4.72.20 10.10.0.0/16 172.16.4.8 192.168.10.4'),
    '192.0.2.20 198.51.100.0/24 198.51.100.8 203.0.113.4');
  assert.equal(normalise('8.8.8.8 8.8.4.4 1.1.1.1'), '192.0.2.53 198.51.100.53 203.0.113.53');
  assert.equal(normalise('https://10.4.80.20:9440/ 10.0.0.0/25'), 'https://203.0.113.20:9440/ 192.0.2.0/25');
  assert.equal(normalise('clusters.10.20.30.201.name'), 'clusters.192.0.2.201.name');
});

test('protocol endpoints, masks, versions and existing examples retain their meaning', () => {
  const text = '192.168.5.1 127.0.0.1 0.0.0.0 255.255.255.0 v1.8.5.1 192.0.2.20 198.51.100.0/24 203.0.113.7 999.1.2.3';
  assert.equal(normalise(text), text);
  assert.equal(normalise(normalise('10.0.0.1/16')), normalise('10.0.0.1/16'));
});
