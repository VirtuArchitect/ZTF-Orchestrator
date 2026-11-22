/** Documentation capture helper. Never use this to rewrite live configuration. */
function documentationAddresses(text) {
  return String(text).replace(/(?<!\d)(?<!\d\.)((?:\d{1,3}\.){3}\d{1,3})(\/\d{1,2})?(?!\d|\.\d)/g, (full, address, cidr = '') => {
    const [a, b, c, d] = address.split('.').map(Number);
    if ([a, b, c, d].some(value => value > 255)) return full;
    let replacement;
    if (a === 10) replacement = b === 10 ? `198.51.100.${d}` : b === 4 && c === 80 ? `203.0.113.${d}` : `192.0.2.${d}`;
    else if (a === 172 && b >= 16 && b <= 31) replacement = `198.51.100.${d}`;
    else if (a === 192 && b === 168 && !(c === 5 && d === 1)) replacement = `203.0.113.${d}`;
    else if (a === 8 && b === 8 && c === 8 && d === 8) replacement = '192.0.2.53';
    else if (a === 8 && b === 8 && c === 4 && d === 4) replacement = '198.51.100.53';
    else if (a === 1 && b === 1 && c === 1 && d === 1) replacement = '203.0.113.53';
    if (!replacement) return full;
    // TEST-NET allocations are /24s. Retain more-specific host/subnet examples.
    return replacement + (cidr ? '/' + Math.max(24, Number(cidr.slice(1))) : '');
  });
}

module.exports = { documentationAddresses };
