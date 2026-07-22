import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
};

const {
    computeMonthlyTotals,
    getLoanPaymentForMonth,
    runAnnuitySimulation,
    state
} = await import('../state.js?calculation-tests');

function resetState() {
    state.transactions = [];
    state.fixedExpenses = [];
    state.loans = [];
    state.buildingCosts = [];
    state.houseExpenses = [];
    state.scenarioSettings = { isScenarioModeActive: false, rentExpenseAmount: 0 };
}

test('monthly report includes configured fixed salary exactly once', () => {
    resetState();
    state.fixedExpenses = [{
        id: 'salary',
        title: 'Gehalt',
        amount: 3000,
        isIncome: true,
        category: 'Gehalt',
        assignedTo: 'Partner 1',
        startDate: '2026-01-01T00:00:00.000Z'
    }];

    const totals = computeMonthlyTotals(2026, 7, 'Alle');
    assert.equal(totals.income, 3000);
    assert.equal(totals.expenses, 0);
});

test('installment loan is charged only inside its term and uses the closing rate', () => {
    const loan = {
        loanType: 'Ratenkredit',
        loanAmount: 150,
        monthlyRate: 100,
        customSchlussrate: 50,
        plannedTermMonths: 2,
        firstPaymentDate: '2026-01-15'
    };

    assert.equal(getLoanPaymentForMonth(loan, 2025, 12), 0);
    assert.equal(getLoanPaymentForMonth(loan, 2026, 1), 100);
    assert.equal(getLoanPaymentForMonth(loan, 2026, 2), 50);
    assert.equal(getLoanPaymentForMonth(loan, 2026, 3), 0);
});

test('annuity payment stops after payoff and disabled special payments stay disabled', () => {
    const shortLoan = {
        loanType: 'Hausbaukredit',
        loanAmount: 100,
        monthlyRate: 60,
        interestRate: 0,
        firstPaymentDate: '2026-01-01'
    };
    assert.equal(getLoanPaymentForMonth(shortLoan, 2026, 1), 60);
    assert.equal(getLoanPaymentForMonth(shortLoan, 2026, 2), 40);
    assert.equal(getLoanPaymentForMonth(shortLoan, 2026, 3), 0);

    const withDisabledSpecialPayment = {
        loanType: 'Hausbaukredit',
        loanAmount: 2400,
        monthlyRate: 100,
        interestRate: 0,
        startDate: '2026-01-01',
        firstPaymentDate: '2026-01-01',
        fixedTermYears: 1,
        oneTimeSondertilgungen: [{ year: 1, amount: 500, isApplied: false }]
    };
    const simulation = runAnnuitySimulation(withDisabledSpecialPayment, true);
    assert.equal(simulation.yearlyRows[0].sondertilgungPaid, 0);
    assert.equal(simulation.yearlyRows[0].endBalance, 1200);
});
