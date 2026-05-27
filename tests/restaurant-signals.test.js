// Unit tests for the abnormal-day classifier in apps-script/RestaurantSignals.js.
//
// The classifier filters promo/voids/capacity days out of coefficient tuning
// so the auto-tuner learns weather effects only from operationally normal days.
// These tests pin the thresholds in SIGNALS_CONFIG so silent threshold drift
// gets caught.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScriptFiles } = require('./helpers/loadAppsScript');

const m = loadAppsScriptFiles('RestaurantSignals.js');

test('SIGNALS_CONFIG thresholds match the hygiene contract', () => {
  // Locked in by aba4e13. Changing these silently could let promo/void days
  // back into the tuning set.
  assert.equal(m.SIGNALS_CONFIG.THRESHOLDS.PROMO_DISCOUNT_RATE, 0.10);
  assert.equal(m.SIGNALS_CONFIG.THRESHOLDS.HIGH_VOID_RATE, 0.05);
  assert.equal(m.SIGNALS_CONFIG.THRESHOLDS.CAPACITY_HOURS_DROP, 0.20);
});

test('isAbnormalDay returns null when signal is missing', () => {
  assert.equal(m.isAbnormalDay(null, 100), null);
  assert.equal(m.isAbnormalDay(undefined, 100), null);
});

test('isAbnormalDay returns null for normal days', () => {
  const signal = { discountRate: 0.05, voidRate: 0.02, hours: 95 };
  assert.equal(m.isAbnormalDay(signal, 100), null);
});

test('isAbnormalDay flags promo days when discountRate > 10%', () => {
  // Just over threshold
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.101, voidRate: 0.02, hours: 100 }, 100),
    'promo'
  );
  // Right at threshold — NOT flagged (strict greater-than)
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.10, voidRate: 0.02, hours: 100 }, 100),
    null
  );
  // Heavy promo
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.25, voidRate: 0.02, hours: 100 }, 100),
    'promo'
  );
});

test('isAbnormalDay flags void-heavy days when voidRate > 5%', () => {
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.06, hours: 100 }, 100),
    'voids'
  );
  // At threshold: not flagged
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.05, hours: 100 }, 100),
    null
  );
});

test('isAbnormalDay flags capacity-constrained days (hours < 80% of median)', () => {
  // 80% of 100 = 80. Below 80 is capacity-constrained.
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.02, hours: 79 }, 100),
    'capacity'
  );
  // At threshold: not flagged
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.02, hours: 80 }, 100),
    null
  );
  // Comfortably above
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.02, hours: 90 }, 100),
    null
  );
});

test('isAbnormalDay does NOT flag capacity when hours=0 (closed day)', () => {
  // A 0-hours day is treated as missing data, not a capacity issue. Otherwise
  // closed holidays would all incorrectly flag as capacity-constrained.
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.02, hours: 0 }, 100),
    null
  );
});

test('isAbnormalDay does NOT flag capacity when median is missing', () => {
  // No baseline yet for this location — can't classify as capacity.
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.02, hours: 50 }, null),
    null
  );
  assert.equal(
    m.isAbnormalDay({ discountRate: 0.05, voidRate: 0.02, hours: 50 }, undefined),
    null
  );
});

test('isAbnormalDay priority: promo > voids > capacity', () => {
  // Day that meets all three abnormality criteria — returns the highest-priority.
  const triple = { discountRate: 0.15, voidRate: 0.10, hours: 50 };
  assert.equal(m.isAbnormalDay(triple, 100), 'promo');

  // Voids + capacity but no promo
  const voidsAndCap = { discountRate: 0.05, voidRate: 0.10, hours: 50 };
  assert.equal(m.isAbnormalDay(voidsAndCap, 100), 'voids');
});
