const { test } = require('node:test');
const assert = require('node:assert/strict');
test('optional GeoIP dependency retains CommonJS lookup contract after security upgrade', () => {
  const geoip = require('geoip-lite');
  assert.equal(typeof geoip.lookup, 'function');
  const result = geoip.lookup('8.8.8.8');
  assert.ok(result);
  assert.equal(typeof result.country, 'string');
  assert.ok(Array.isArray(result.ll));
  assert.equal(geoip.lookup('invalid-ip'), null);
});
