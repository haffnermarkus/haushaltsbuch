import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateHousingTotal,
    cloneJson,
    isSafeIconGlyph,
    makeScopedStorageKey,
    mergeTransactions,
    nextPendingRecord,
    shouldApplySpecialPayment
} from '../sync-utils.js';

test('Drive storage keys are isolated by account and main file', () => {
    const first = makeScopedStorageKey('pending', 'account/a', 'file-1');
    const secondAccount = makeScopedStorageKey('pending', 'account/b', 'file-1');
    const secondFile = makeScopedStorageKey('pending', 'account/a', 'file-2');
    assert.notEqual(first, secondAccount);
    assert.notEqual(first, secondFile);
    assert.match(first, /^pending::/);
    assert.throws(() => makeScopedStorageKey('pending', ''), /Kontokontext/);
});

test('pending records are revisioned and snapshot their input', () => {
    const source = [{ id: '1', amount: 10 }];
    const first = nextPendingRecord(null, source, '2026-01-01T00:00:00.000Z');
    source[0].amount = 99;
    const second = nextPendingRecord(first, source, '2026-01-01T00:00:01.000Z');
    assert.equal(first.revision, 1);
    assert.equal(first.snapshot[0].amount, 10);
    assert.equal(second.revision, 2);
    assert.equal(second.snapshot[0].amount, 99);
    assert.deepEqual(cloneJson(second.snapshot), second.snapshot);
});

test('transaction merge keeps the newest row and deletion wins a timestamp tie', () => {
    const local = [
        { id: 'a', amount: 1, updatedAt: '2026-01-02T00:00:00Z' },
        { id: 'b', isDeleted: true, updatedAt: '2026-01-01T00:00:00Z' }
    ];
    const remote = [
        { id: 'a', amount: 2, updatedAt: '2026-01-01T00:00:00Z' },
        { id: 'b', isDeleted: false, updatedAt: '2026-01-01T00:00:00Z' }
    ];
    const merged = mergeTransactions(local, remote);
    assert.equal(merged.find(item => item.id === 'a').amount, 1);
    assert.equal(merged.find(item => item.id === 'b').isDeleted, true);
});

test('housing costs use recurring house expenses, never one-time building costs', () => {
    const houseTotal = calculateHousingTotal({
        isScenarioActive: true,
        housingScenario: 'House',
        rentAmount: 900,
        houseExpenses: [{ amount: 1200 }, { Amount: '250.50' }, { amount: 'invalid' }]
    });
    assert.equal(houseTotal, 1450.5);
    assert.equal(calculateHousingTotal({
        isScenarioActive: false,
        housingScenario: 'House',
        rentAmount: '900',
        houseExpenses: [{ amount: 1200 }]
    }), 900);
});

test('special payments require both simulation and item opt-in', () => {
    assert.equal(shouldApplySpecialPayment(true, true), true);
    assert.equal(shouldApplySpecialPayment(true, false), false);
    assert.equal(shouldApplySpecialPayment(false, true), false);
});

test('custom icon glyphs reject markup and control characters', () => {
    assert.equal(isSafeIconGlyph('🏠'), true);
    assert.equal(isSafeIconGlyph('<img src=x>'), false);
    assert.equal(isSafeIconGlyph('x\n'), false);
});
