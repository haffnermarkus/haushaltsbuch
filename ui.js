import {
    state,
    MONTH_NAMES,
    escapeHtml,
    formatCurrency,
    getCategoryEmoji,
    runAnnuitySimulation,
    updateSingleLoanCalculations,
    saveLoansToLocal,
    v,
    computeMonthlyTotals,
    getScenarioValues,
    getTotalHouseExpenses,
    getHousingTotal
} from './state.js';

export function getAssignedDisplayName(assigned) {
    if (assigned === 'Partner 1') return state.partner1Name || 'Markus';
    if (assigned === 'Partner 2') return state.partner2Name || 'Maren';
    return assigned || 'Gemeinsam';
}

export function updatePartnerDropdowns() {
    const p1Name = state.partner1Name || 'Markus';
    const p2Name = state.partner2Name || 'Maren';

    ['filter-assigned', 'field-assigned', 'fixed-field-assigned', 'months-partner', 'bk-field-paidby'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const p1Opt = select.querySelector('option[value="Partner 1"]');
        if (p1Opt) p1Opt.textContent = p1Name;
        const p2Opt = select.querySelector('option[value="Partner 2"]');
        if (p2Opt) p2Opt.textContent = p2Name;
    });
}

import {
    openTransactionDialog,
    confirmDeleteTransaction,
    openFixedExpenseDialog,
    confirmDeleteFixedExpense,
    openHouseExpenseDialog,
    openBuildingCostDialog
} from './app.js';

export function updateDataViews() {
    if (state.activeTab === 'dashboard') {
        renderDashboard();
    } else if (state.activeTab === 'transactions') {
        renderFilterableTransactions();
    } else if (state.activeTab === 'fixed-expenses') {
        renderFixedExpenses();
    } else if (state.activeTab === 'loans') {
        renderLoans();
    } else if (state.activeTab === 'baukosten') {
        renderBuildingCosts();
    } else if (state.activeTab === 'months') {
        renderMonthsOverview();
    } else if (state.activeTab === 'hauskosten') {
        renderHouseExpenses();
    } else if (state.activeTab === 'szenarien') {
        renderScenario();
    }
}

// ==================== DASHBOARD VIEW ====================
export function renderDashboard() {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    
    const labelEl = document.getElementById('dash-month-label');
    if (labelEl) labelEl.textContent = `${MONTH_NAMES[month - 1]} ${year}`;

    // 1. Current Month Stats
    const monthTrans = state.transactions.filter(t => {
        if (t.isDeleted || t.IsDeleted) return false;
        if (t.isFixedCost || t.IsFixedCost) return false;
        const d = new Date(t.date || t.Date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    const income = monthTrans.filter(t => t.isIncome || t.IsIncome).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
    const expenses = monthTrans.filter(t => !(t.isIncome || t.IsIncome)).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
    const surplus = income - expenses;

    const incEl = document.getElementById('dash-stat-income');
    if (incEl) incEl.textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    const expEl = document.getElementById('dash-stat-expenses');
    if (expEl) expEl.textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;
    
    const surplusEl = document.getElementById('dash-stat-surplus');
    if (surplusEl) {
        surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
        surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    }

    // 2. Baukosten Overview Stats
    let totalBc = 0;
    let paidBc = 0;
    state.buildingCosts.forEach(item => {
        const amt = item.amount || item.Amount || 0;
        const paid = item.isPaid !== undefined ? item.isPaid : (item.IsPaid !== undefined ? item.IsPaid : false);
        totalBc += amt;
        if (paid) paidBc += amt;
    });
    const unpaidBc = totalBc - paidBc;
    const bcPercent = totalBc > 0 ? (paidBc / totalBc) * 100 : 0;

    const bcPaidEl = document.getElementById('dash-bc-paid');
    if (bcPaidEl) bcPaidEl.textContent = formatCurrency(paidBc);
    const bcUnpaidEl = document.getElementById('dash-bc-unpaid');
    if (bcUnpaidEl) bcUnpaidEl.textContent = formatCurrency(unpaidBc);
    const bcBarEl = document.getElementById('dash-bc-progress-bar');
    if (bcBarEl) bcBarEl.style.width = `${bcPercent}%`;

    // 3. Loans Overview Stats
    const activeLoans = state.loans || [];
    let totalDebt = 0;
    activeLoans.forEach(l => {
        updateSingleLoanCalculations(l);
        totalDebt += parseFloat(l.remainingDebtToday || l.RemainingDebtToday || 0);
    });

    const loansCountEl = document.getElementById('dash-loans-count');
    if (loansCountEl) loansCountEl.textContent = activeLoans.length;
    const loansDebtEl = document.getElementById('dash-loans-debt');
    if (loansDebtEl) loansDebtEl.textContent = formatCurrency(totalDebt);

    // 4. Recent Transactions List (Last 5 items)
    const recentContainer = document.getElementById('dash-recent-transactions');
    if (recentContainer) {
        recentContainer.innerHTML = '';
        const allActive = state.transactions.filter(t => !(t.isDeleted || t.IsDeleted) && !(t.isFixedCost || t.IsFixedCost));
        allActive.sort((a, b) => new Date(b.date || b.Date) - new Date(a.date || a.Date));
        
        const last5 = allActive.slice(0, 5);
        if (last5.length === 0) {
            recentContainer.innerHTML = `<div class="no-transactions">Keine Buchungen vorhanden.</div>`;
        } else {
            last5.forEach(t => {
                const item = document.createElement('div');
                item.className = 'transaction-item';
                item.style.cursor = 'pointer';
                
                const date = new Date(t.date || t.Date);
                const dateFormatted = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                const cat = t.category || t.Category || 'Sonstiges';
                const icon = getCategoryEmoji(cat);
                const title = t.title || t.Title || '';
                const amt = t.amount || t.Amount || 0;
                const isIncome = t.isIncome !== undefined ? t.isIncome : (t.IsIncome !== undefined ? t.IsIncome : false);
                
                item.innerHTML = `
                    <div class="transaction-left">
                        <div class="category-icon">${icon}</div>
                        <div class="transaction-details">
                            <h5 style="margin:0;">${escapeHtml(title)}</h5>
                            <div class="subtitle" style="font-size:10px;">${dateFormatted} • ${escapeHtml(getAssignedDisplayName(t.assignedTo || t.AssignedTo))}</div>
                        </div>
                    </div>
                    <div class="transaction-right">
                        <span class="amount ${isIncome ? 'income' : 'expense'}" style="font-weight:700;">
                            ${isIncome ? '+' : '-'}${parseFloat(amt).toFixed(2).replace('.', ',')} €
                        </span>
                    </div>
                `;
                item.addEventListener('click', () => showTransactionDetails(t.id || t.Id));
                recentContainer.appendChild(item);
            });
        }
    }
}



// ==================== FILTERABLE TRANSACTIONS (AUSWERTUNG) ====================
export function renderFilterableTransactions() {
    const container = document.getElementById('filter-transactions-list');
    if (!container) return;
    container.innerHTML = '';

    const searchVal = document.getElementById('filter-search').value.toLowerCase().trim();
    const yearVal = document.getElementById('filter-year').value;
    const monthVal = document.getElementById('filter-month').value;
    const catVal = document.getElementById('filter-category').value;
    const assignVal = document.getElementById('filter-assigned').value;
    const typeVal = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'All';

    const settings = state.scenarioSettings || {};
    const isScenarioActive = settings.IsScenarioModeActive || settings.isScenarioModeActive || false;
    const housingScenario = settings.HousingScenario || settings.housingScenario || 'Rent';

    const rawItems = [];

    // 1. Monatskosten (Variable Transactions)
    state.transactions.forEach(t => {
        if (t.isDeleted || t.IsDeleted) return;
        if (t.isFixedCost || t.IsFixedCost) return;
        
        rawItems.push({
            id: t.id || t.Id,
            title: t.title || t.Title || '',
            amount: parseFloat(t.amount || t.Amount || 0),
            type: 'Monatskosten',
            category: t.category || t.Category || 'Sonstiges',
            assignedTo: t.assignedTo || t.AssignedTo || 'Gemeinsam',
            date: new Date(t.date || t.Date),
            isIncome: t.isIncome !== undefined ? t.isIncome : (t.IsIncome !== undefined ? t.IsIncome : false),
            notes: t.notes || t.Notes || ''
        });
    });

    // 2. Fixkosten (Fixed Expenses)
    state.transactions.forEach(t => {
        if (t.isDeleted || t.IsDeleted) return;
        if (!(t.isFixedCost || t.IsFixedCost)) return;
        
        rawItems.push({
            id: t.id || t.Id,
            title: t.title || t.Title || '',
            amount: parseFloat(t.amount || t.Amount || 0),
            type: 'Fixkosten',
            category: t.category || t.Category || 'Sonstiges',
            assignedTo: t.assignedTo || t.AssignedTo || 'Gemeinsam',
            date: new Date(t.date || t.Date),
            isIncome: t.isIncome !== undefined ? t.isIncome : (t.IsIncome !== undefined ? t.IsIncome : false),
            notes: t.notes || t.Notes || ''
        });
    });

    // 3. Baukosten (Building Costs)
    if (state.buildingCosts) {
        state.buildingCosts.forEach(b => {
            const isPaid = b.isPaid !== undefined ? b.isPaid : (b.IsPaid !== undefined ? b.IsPaid : false);
            const pDate = b.paymentDate || b.PaymentDate;
            if (isPaid && pDate) {
                rawItems.push({
                    id: b.id || b.Id,
                    title: `Baukosten: ${b.name || b.Name}`,
                    amount: parseFloat(b.amount || b.Amount || 0),
                    type: 'Baukosten',
                    category: 'Baukosten',
                    assignedTo: b.paidBy || b.PaidBy || 'Gemeinsam',
                    date: new Date(pDate),
                    isIncome: false,
                    notes: b.notes || b.Notes || ''
                });
            }
        });
    }

    // 4. Virtual Rent Shares
    const rentAmount = parseFloat(settings.RentExpenseAmount || settings.rentExpenseAmount || 850.00);
    const rentTotal = (isScenarioActive && housingScenario === 'House') ? 0 : rentAmount;

    if (rentTotal > 0) {
        const activeMonths = [];
        const seen = new Set();
        state.transactions.forEach(t => {
            if (t.isDeleted || t.IsDeleted) return;
            const d = new Date(t.date || t.Date);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            if (!seen.has(key)) {
                seen.add(key);
                activeMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
            }
        });

        const curDate = new Date();
        const curKey = `${curDate.getFullYear()}-${curDate.getMonth() + 1}`;
        if (!seen.has(curKey)) {
            activeMonths.push({ year: curDate.getFullYear(), month: curDate.getMonth() + 1 });
        }

        const p1Name = state.partner1Name || "Partner 1";
        const p2Name = state.partner2Name || "Partner 2";
        const p1SharePercent = parseFloat(settings.RentPartner1SharePercent || settings.rentPartner1SharePercent || 50.00);

        activeMonths.forEach(am => {
            const dateVal = new Date(am.year, am.month - 1, 1);
            const p1Share = rentTotal * (p1SharePercent / 100);
            const p2Share = rentTotal * ((100 - p1SharePercent) / 100);

            if (assignVal === 'All') {
                rawItems.push({
                    id: `virtual-rent-p1-${am.year}-${am.month}`,
                    title: `Mietkosten (${p1Name}-Anteil)`,
                    amount: p1Share,
                    type: 'Fixkosten',
                    category: 'Wohnen',
                    assignedTo: 'Partner 1',
                    date: dateVal,
                    isIncome: false,
                    notes: 'Anteilige Mietkosten'
                });
                rawItems.push({
                    id: `virtual-rent-p2-${am.year}-${am.month}`,
                    title: `Mietkosten (${p2Name}-Anteil)`,
                    amount: p2Share,
                    type: 'Fixkosten',
                    category: 'Wohnen',
                    assignedTo: 'Partner 2',
                    date: dateVal,
                    isIncome: false,
                    notes: 'Anteilige Mietkosten'
                });
            }
            else if (assignVal === 'Partner 1') {
                rawItems.push({
                    id: `virtual-rent-p1-${am.year}-${am.month}`,
                    title: `Mietkosten (${p1Name}-Anteil)`,
                    amount: p1Share,
                    type: 'Fixkosten',
                    category: 'Wohnen',
                    assignedTo: 'Partner 1',
                    date: dateVal,
                    isIncome: false,
                    notes: 'Anteilige Mietkosten'
                });
            }
            else if (assignVal === 'Partner 2') {
                rawItems.push({
                    id: `virtual-rent-p2-${am.year}-${am.month}`,
                    title: `Mietkosten (${p2Name}-Anteil)`,
                    amount: p2Share,
                    type: 'Fixkosten',
                    category: 'Wohnen',
                    assignedTo: 'Partner 2',
                    date: dateVal,
                    isIncome: false,
                    notes: 'Anteilige Mietkosten'
                });
            }
            else if (assignVal === 'Gemeinsam') {
                rawItems.push({
                    id: `virtual-rent-shared-${am.year}-${am.month}`,
                    title: `Mietkosten (Gemeinsam)`,
                    amount: rentTotal,
                    type: 'Fixkosten',
                    category: 'Wohnen',
                    assignedTo: 'Gemeinsam',
                    date: dateVal,
                    isIncome: false,
                    notes: 'Gemeinsame Mietkosten'
                });
            }
        });
    }

    const filtered = rawItems.filter(item => {
        // Search text
        if (searchVal) {
            const title = item.title.toLowerCase();
            const notes = item.notes.toLowerCase();
            if (!title.includes(searchVal) && !notes.includes(searchVal)) return false;
        }

        // Date
        if (yearVal !== 'All' && item.date.getFullYear().toString() !== yearVal) return false;
        if (monthVal !== 'All' && (item.date.getMonth() + 1).toString() !== monthVal) return false;

        // Category
        if (catVal !== 'All' && item.category !== catVal) return false;

        // Type
        if (typeVal !== 'All' && item.type !== typeVal) return false;

        // Assigned To
        if (assignVal !== 'All' && item.assignedTo !== assignVal) return false;

        return true;
    });

    // Sort descending by date
    filtered.sort((a, b) => b.date - a.date);

    // Calculate aggregates
    const income = filtered.filter(t => t.isIncome).reduce((sum, t) => sum + t.amount, 0);
    const expenses = filtered.filter(t => !t.isIncome).reduce((sum, t) => sum + t.amount, 0);
    const surplus = income - expenses;

    document.getElementById('filter-transaction-count').textContent = filtered.length;
    document.getElementById('filter-sum-income').textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    document.getElementById('filter-sum-expense').textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;
    
    const surplusEl = document.getElementById('filter-sum-surplus');
    surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
    surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

    // Ausgleichsrechnung für gemeinschaftliche Baukosten (identisch zur PC-Logik):
    // Nur Baukosten zählen, die von einem der Partner allein bezahlt wurden.
    const balanceEl = document.getElementById('filter-baukosten-balance');
    if (balanceEl) {
        const p1Bk = filtered.filter(i => i.type === 'Baukosten' && i.assignedTo === 'Partner 1').reduce((s, i) => s + i.amount, 0);
        const p2Bk = filtered.filter(i => i.type === 'Baukosten' && i.assignedTo === 'Partner 2').reduce((s, i) => s + i.amount, 0);
        if (p1Bk > 0 || p2Bk > 0) {
            balanceEl.style.display = 'block';
            const diff = (p1Bk - p2Bk) / 2;
            const p1Name = state.partner1Name || 'Partner 1';
            const p2Name = state.partner2Name || 'Partner 2';
            if (diff > 0.005) {
                balanceEl.innerHTML = `⚖️ <strong>${escapeHtml(p2Name)}</strong> schuldet <strong>${escapeHtml(p1Name)}</strong> ${formatCurrency(diff)} (für gemeinschaftliche Baukosten).`;
            } else if (diff < -0.005) {
                balanceEl.innerHTML = `⚖️ <strong>${escapeHtml(p1Name)}</strong> schuldet <strong>${escapeHtml(p2Name)}</strong> ${formatCurrency(Math.abs(diff))} (für gemeinschaftliche Baukosten).`;
            } else {
                balanceEl.innerHTML = `⚖️ Ausgeglichene Baukosten-Abrechnung.`;
            }
        } else {
            balanceEl.style.display = 'none';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `<div class="no-transactions">Keine Buchungen mit diesen Filterkriterien gefunden.</div>`;
        return;
    }

    filtered.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        
        const dateFormatted = t.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const cat = t.category;
        const icon = getCategoryEmoji(cat);
        const title = t.title;
        const amt = t.amount;
        const isIncome = t.isIncome;

        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5 style="margin:0;">${escapeHtml(title)}</h5>
                    <div class="subtitle" style="font-size:10px;">${dateFormatted} • ${escapeHtml(getAssignedDisplayName(t.assignedTo))}</div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount ${isIncome ? 'income' : 'expense'}" style="font-weight:700;">
                    ${isIncome ? '+' : '-'}${parseFloat(amt).toFixed(2).replace('.', ',')} €
                </span>
            </div>
        `;
        
        if (t.id && !t.id.toString().startsWith('virtual-rent-')) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => showTransactionDetails(t.id));
        } else {
            item.style.cursor = 'default';
        }
        
        container.appendChild(item);
    });
}

// ==================== FIXED EXPENSES (FIXKOSTEN) ====================
function isRentExpense(f) {
    const title = (f.title || f.Title || '').toLowerCase();
    const category = f.category || f.Category || '';
    return category === 'Wohnen' && (title.includes('miete') || title.includes('wohnungsmiete'));
}

export function renderFixedExpenses() {
    const container = document.getElementById('fixed-expenses-list');
    if (!container) return;
    container.innerHTML = '';

    const list = state.fixedExpenses || [];
    const activeLoans = (state.loans || []).filter(l => l.includeInFixedCosts !== false && l.IncludeInFixedCosts !== false);

    const settings = state.scenarioSettings || {};
    const isScenarioActive = settings.IsScenarioModeActive || settings.isScenarioModeActive || false;
    const housingScenario = settings.HousingScenario || settings.housingScenario || 'Rent';
    const rentAmount = parseFloat(settings.RentExpenseAmount || settings.rentExpenseAmount || 850.00);
    
    let housingTotal = rentAmount;
    let housingText = "Miete (Mietwohnung)";
    
    if (isScenarioActive && housingScenario === 'House') {
        const bCosts = state.buildingCosts || [];
        housingTotal = bCosts.reduce((sum, b) => sum + parseFloat(b.amount || b.Amount || 0), 0);
        housingText = "Baukosten (Hausbau)";
    }

    // Apply Filter based on StartDate
    const filterMonthVal = document.getElementById('fixed-filter-month') ? document.getElementById('fixed-filter-month').value : 'All';
    const filterYearVal = document.getElementById('fixed-filter-year') ? document.getElementById('fixed-filter-year').value : 'All';

    let filteredList = [...list];
    
    if (filterYearVal !== 'All') {
        const year = parseInt(filterYearVal);
        if (filterMonthVal !== 'All') {
            const month = parseInt(filterMonthVal);
            filteredList = filteredList.filter(f => {
                const startStr = f.startDate || f.StartDate;
                if (!startStr) return true;
                const sd = new Date(startStr);
                return sd.getFullYear() < year || (sd.getFullYear() === year && (sd.getMonth() + 1) <= month);
            });
        } else {
            filteredList = filteredList.filter(f => {
                const startStr = f.startDate || f.StartDate;
                if (!startStr) return true;
                const sd = new Date(startStr);
                return sd.getFullYear() <= year;
            });
        }
    } else if (filterMonthVal !== 'All') {
        const month = parseInt(filterMonthVal);
        filteredList = filteredList.filter(f => {
            const startStr = f.startDate || f.StartDate;
            if (!startStr) return true;
            const sd = new Date(startStr);
            return (sd.getMonth() + 1) <= month;
        });
    }

    // Sort by day of month
    filteredList.sort((a, b) => parseInt(a.dayOfMonth || a.DayOfMonth || 1) - parseInt(b.dayOfMonth || b.DayOfMonth || 1));

    // Calculate aggregates
    const income = filteredList.filter(f => f.isIncome || f.IsIncome).reduce((sum, f) => sum + parseFloat(f.amount || f.Amount || 0), 0);
    const loanFixedExp = activeLoans.reduce((sum, l) => sum + parseFloat(l.monthlyRate || l.MonthlyRate || 0), 0);
    const expenses = filteredList.filter(f => !(f.isIncome || f.IsIncome) && !isRentExpense(f)).reduce((sum, f) => sum + parseFloat(f.amount || f.Amount || 0), 0) + loanFixedExp + housingTotal;
    const surplus = income - expenses;

    document.getElementById('fixed-expenses-count').textContent = filteredList.length + activeLoans.length + 1;
    const incomeEl = document.getElementById('fixed-total-income');
    if (incomeEl) incomeEl.textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    const expensesEl = document.getElementById('fixed-total-expenses');
    if (expensesEl) expensesEl.textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;

    const surplusEl = document.getElementById('fixed-total-surplus');
    if (surplusEl) {
        surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
        surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    }

    // Render Housing row
    const housingItem = document.createElement('div');
    housingItem.className = 'transaction-item';
    housingItem.style.opacity = '0.85';
    
    const p1Share = parseFloat(settings.RentPartner1SharePercent || settings.rentPartner1SharePercent || 50.00);
    const p2Share = 100.00 - p1Share;
    const splitText = `Aufgeteilt: ${state.partner1Name} ${p1Share}% / ${state.partner2Name} ${p2Share}%`;
    
    housingItem.innerHTML = `
        <div class="transaction-left">
            <div class="category-icon">🏠</div>
            <div class="transaction-details">
                <h5 style="margin:0;">${escapeHtml(housingText)} <span style="font-size:10px; color:var(--accent); font-weight:normal;">(Szenario)</span></h5>
                <div class="subtitle" style="font-size:10px;">Jeden 1. des Monats • ${escapeHtml(splitText)}</div>
            </div>
        </div>
        <div class="transaction-right">
            <span class="amount expense" style="font-weight:700;">
                -${housingTotal.toFixed(2).replace('.', ',')} €
            </span>
            <div class="transaction-actions" style="margin-left:8px;">
                <span style="font-size:10px; color:var(--text-tertiary); font-style:italic; margin-right:4px;">Automatisch</span>
            </div>
        </div>
    `;
    container.appendChild(housingItem);

    if (filteredList.length === 0 && activeLoans.length === 0) {
        return;
    }

    filteredList.forEach(f => {
        const item = document.createElement('div');
        item.className = 'transaction-item';

        const cat = f.category || f.Category || 'Sonstiges';
        const icon = getCategoryEmoji(cat);
        const title = f.title || f.Title || '';
        const amt = f.amount || f.Amount || 0;
        const isIncome = f.isIncome !== undefined ? f.isIncome : (f.IsIncome !== undefined ? f.IsIncome : false);
        const day = f.dayOfMonth || f.DayOfMonth || 1;
        const assigned = getAssignedDisplayName(f.assignedTo || f.AssignedTo);
        
        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5 style="margin:0;">${escapeHtml(title)}</h5>
                    <div class="subtitle" style="font-size:10px;">Jeden ${day}. des Monats • ${escapeHtml(assigned)}</div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount ${isIncome ? 'income' : 'expense'}" style="font-weight:700;">
                    ${isIncome ? '+' : '-'}${parseFloat(amt).toFixed(2).replace('.', ',')} €
                </span>
                <div class="transaction-actions">
                    <button class="action-btn edit-fixed" data-id="${f.id || f.Id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </button>
                    <button class="action-btn delete-fixed" data-id="${f.id || f.Id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        item.querySelector('.edit-fixed').addEventListener('click', (e) => {
            e.stopPropagation();
            openFixedExpenseDialog(f.id || f.Id);
        });

        item.querySelector('.delete-fixed').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteFixedExpense(f.id || f.Id);
        });

        container.appendChild(item);
    });

    activeLoans.forEach(l => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.style.opacity = '0.85';

        const cat = 'Kredite';
        const icon = '🏦';
        const title = l.name || l.Name || 'Kreditrate';
        const amt = l.monthlyRate || l.MonthlyRate || 0;
        const dayDate = new Date(l.firstPaymentDate || l.FirstPaymentDate || new Date());
        const day = isNaN(dayDate.getDate()) ? 1 : dayDate.getDate();
        const assigned = getAssignedDisplayName(l.assignedTo || l.AssignedTo);

        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5 style="margin:0;">${escapeHtml(title)} <span style="font-size:10px; color:var(--accent); font-weight:normal;">(Kredit)</span></h5>
                    <div class="subtitle" style="font-size:10px;">Jeden ${day}. des Monats • ${escapeHtml(assigned)}</div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount expense" style="font-weight:700;">
                    -${parseFloat(amt).toFixed(2).replace('.', ',')} €
                </span>
                <div class="transaction-actions" style="margin-left:8px;">
                    <span style="font-size:10px; color:var(--text-tertiary); font-style:italic; margin-right:4px;">Automatisch</span>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

// ==================== LOANS (KREDITE) ====================
export function renderLoans() {
    const select = document.getElementById('loan-selector');
    const statsContainer = document.getElementById('loan-stats-container');
    const stContainer = document.getElementById('loan-sondertilgung-container');
    const scheduleContainer = document.getElementById('loan-schedule-container');
    const emptyView = document.getElementById('loans-empty-view');

    if (!select) return;

    const list = state.loans || [];

    if (list.length === 0) {
        select.style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
        if (stContainer) stContainer.style.display = 'none';
        if (scheduleContainer) scheduleContainer.style.display = 'none';
        if (emptyView) emptyView.style.display = 'block';
        return;
    }

    select.style.display = 'block';
    if (emptyView) emptyView.style.display = 'none';

    // Populate dropdown if needed (only if count changed or empty)
    const currentVal = select.value;
    select.innerHTML = '';
    list.forEach((loan, idx) => {
        const opt = document.createElement('option');
        opt.value = loan.id || loan.Id;
        opt.textContent = loan.name || loan.Name;
        select.appendChild(opt);
    });

    if (currentVal && list.some(l => (l.id || l.Id) === currentVal)) {
        select.value = currentVal;
    } else {
        select.value = list[0].id || list[0].Id;
    }

    state.selectedLoanId = select.value;

    const selectedLoan = list.find(l => (l.id || l.Id) === state.selectedLoanId);
    if (!selectedLoan) return;

    // Run VM-aligned math first
    updateSingleLoanCalculations(selectedLoan);

    // 1. Render Stats
    if (statsContainer) {
        statsContainer.style.display = 'block';
        const typeLabel = (selectedLoan.loanType || selectedLoan.LoanType) === 'Hausbaukredit' ? 'Hausbaukredit' : 'Ratenkredit';
        const originalAmount = parseFloat(selectedLoan.loanAmount || selectedLoan.LoanAmount || 0);
        const remainingDebt = parseFloat(selectedLoan.remainingDebtToday || selectedLoan.RemainingDebtToday || 0);
        const monthlyRate = parseFloat(selectedLoan.monthlyRate || selectedLoan.MonthlyRate || 0);
        const interestRate = parseFloat(selectedLoan.interestRate || selectedLoan.InterestRate || 0);
        const remainingTerm = selectedLoan.remainingTermText || selectedLoan.RemainingTermText || '-';
        const totalInterestPaid = parseFloat(selectedLoan.totalInterestPaidEuro || selectedLoan.TotalInterestPaidEuro || 0);
        const totalInterestFuture = parseFloat(selectedLoan.totalInterestFutureEuro || selectedLoan.TotalInterestFutureEuro || 0);
        const totalInterest = totalInterestPaid + totalInterestFuture;

        statsContainer.innerHTML = `
            <div class="summary-card" style="margin-bottom:16px;">
                <div class="summary-row header">
                    <h3>${escapeHtml(selectedLoan.name || selectedLoan.Name)}</h3>
                    <span class="badge" style="background:rgba(99,102,241,0.15); color:var(--accent); font-weight:700;">${typeLabel}</span>
                </div>
                <div class="summary-details grid-2">
                    <div class="stat-box">
                        <span class="label">Kreditsumme</span>
                        <span class="value" style="font-size:16px;">${formatCurrency(originalAmount)}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Restschuld heute</span>
                        <span class="value expense" style="font-size:16px;">${formatCurrency(remainingDebt)}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Zins / Monatliche Rate</span>
                        <span class="value" style="font-size:14px; font-weight:500;">${interestRate.toFixed(2)}% / ${monthlyRate.toFixed(2)} €</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Restlaufzeit</span>
                        <span class="value income" style="font-size:14px; font-weight:600;">${remainingTerm}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Zuordnung</span>
                        <span class="value" style="font-size:14px; font-weight:500;">${escapeHtml(getAssignedDisplayName(selectedLoan.assignedTo || selectedLoan.AssignedTo))}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">In Fixkosten</span>
                        <span class="value" style="font-size:14px; font-weight:500; color: ${selectedLoan.includeInFixedCosts !== false && selectedLoan.IncludeInFixedCosts !== false ? 'var(--color-income)' : 'var(--text-tertiary)'};">
                            ${selectedLoan.includeInFixedCosts !== false && selectedLoan.IncludeInFixedCosts !== false ? 'Ja' : 'Nein'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="summary-card" style="background:rgba(255,255,255,0.02); border-color:rgba(255,255,255,0.05);">
                <h4 style="margin:0 0 10px 0; font-size:14px;">Zinsauswertung (€)</h4>
                <div class="summary-details">
                    <div class="stat-box">
                        <span class="label">Gezahlte Zinsen</span>
                        <span class="value expense" style="font-size:15px;">${formatCurrency(totalInterestPaid)}</span>
                    </div>
                    <div class="stat-box">
                        <span class="label">Zukünftige Zinsen</span>
                        <span class="value" style="font-size:15px; color:#fbbf24;">${formatCurrency(totalInterestFuture)}</span>
                    </div>
                </div>
                <div class="summary-surplus" style="margin-top:10px; border-top:1px solid var(--border-color); padding-top:8px;">
                    <span class="label">Zinsen Gesamt:</span>
                    <span class="value font-bold" style="font-size:15px;">${formatCurrency(totalInterest)}</span>
                </div>
            </div>
        `;
    }

    // 2. Render Sondertilgungen List
    if (stContainer) {
        stContainer.style.display = 'block';
        const stList = document.getElementById('loan-sondertilgungen-list');
        if (stList) {
            stList.innerHTML = '';
            const items = selectedLoan.oneTimeSondertilgungen || selectedLoan.OneTimeSondertilgungen || [];
            
            if (items.length === 0) {
                stList.innerHTML = `<div style="font-size:12px; color:var(--text-secondary); text-align:center;">Keine Sondertilgungen für diesen Kredit erfasst.</div>`;
            } else {
                items.forEach((item, idx) => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justify = 'space-between';
                    row.style.alignItems = 'center';
                    row.style.padding = '6px 0';
                    
                    const year = item.year !== undefined ? item.year : item.Year;
                    const amount = parseFloat(item.amount !== undefined ? item.amount : item.Amount || 0);
                    const applied = item.isApplied !== undefined ? item.isApplied : (item.IsApplied !== undefined ? item.IsApplied : true);
                    
                    row.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <input type="checkbox" class="st-toggle-checkbox" data-index="${idx}" ${applied ? 'checked' : ''}>
                            <span style="font-size:13px; font-weight:500;">Jahr ${year}</span>
                        </div>
                        <span style="font-size:13px; font-weight:700; color:var(--accent);">${formatCurrency(amount)}</span>
                    `;
                    // Bind checkbox change
                    row.querySelector('.st-toggle-checkbox').addEventListener('change', (e) => {
                        const checked = e.target.checked;
                        if (item.isApplied !== undefined) item.isApplied = checked;
                        if (item.IsApplied !== undefined) item.IsApplied = checked;
                        
                        // Save and reload
                        if (state.mode === 'google') {
                            import('./app.js').then(app => app.saveLoansToGoogle());
                        } else {
                            saveLoansToLocal();
                            renderLoans();
                        }
                    });
                    
                    stList.appendChild(row);
                });
            }
        }
    }

    // 3. Render Amortization schedule yearly rows
    if (scheduleContainer) {
        scheduleContainer.style.display = 'block';
        const tbody = document.getElementById('loan-schedule-tbody');
        if (tbody) {
            tbody.innerHTML = '';
            
            const sim = runAnnuitySimulation(selectedLoan, true);
            sim.yearlyRows.forEach(row => {
                const tr = document.createElement('tr');
                const p = row.period || row.Period || '';
                const start = parseFloat(row.startBalance || row.StartBalance || 0);
                const interest = parseFloat(row.interestPaid || row.InterestPaid || 0);
                const repayment = parseFloat(row.repaymentPaid || row.RepaymentPaid || 0);
                const st = parseFloat(row.sondertilgungPaid || row.SondertilgungPaid || 0);
                const end = parseFloat(row.endBalance || row.EndBalance || 0);

                tr.innerHTML = `
                    <td style="padding: 10px 12px; font-weight:600;">${p}</td>
                    <td style="padding: 10px 12px;">${formatCurrency(start)}</td>
                    <td style="padding: 10px 12px; color:var(--color-expense);">${formatCurrency(interest)}</td>
                    <td style="padding: 10px 12px; color:var(--color-income);">${formatCurrency(repayment)}</td>
                    <td style="padding: 10px 12px; color:var(--accent); font-weight:600;">${st > 0 ? formatCurrency(st) : '-'}</td>
                    <td style="padding: 10px 12px; font-weight:600;">${formatCurrency(end)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}

// ==================== TRANSACTION DETAILS OVERLAY ====================
export function showTransactionDetails(id) {
    state.selectedTransactionId = id;
    const t = state.transactions.find(item => (item.id || item.Id) === id);
    if (!t) return;

    const title = t.title || t.Title || '';
    const amt = t.amount || t.Amount || 0;
    const isIncome = t.isIncome !== undefined ? t.isIncome : (t.IsIncome !== undefined ? t.IsIncome : false);
    const cat = t.category || t.Category || 'Sonstiges';
    const assigned = getAssignedDisplayName(t.assignedTo || t.AssignedTo);
    const notes = t.notes || t.Notes || '';

    // Date formatting (Wochentag, DD.MM.YYYY)
    const dateObj = new Date(t.date || t.Date);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateFormatted = dateObj.toLocaleDateString('de-DE', options);

    document.getElementById('detail-title').textContent = title;
    
    const amountEl = document.getElementById('detail-amount');
    amountEl.textContent = `${isIncome ? '+' : '-'}${parseFloat(amt).toFixed(2).replace('.', ',')} €`;
    amountEl.className = `amount ${isIncome ? 'income' : 'expense'}`;

    document.getElementById('detail-category-icon').textContent = getCategoryEmoji(cat);
    document.getElementById('detail-date').textContent = dateFormatted;
    document.getElementById('detail-category').textContent = cat;
    document.getElementById('detail-assigned').textContent = assigned;
    
    const notesEl = document.getElementById('detail-notes');
    if (notes) {
        notesEl.textContent = notes;
        notesEl.style.fontStyle = 'normal';
        notesEl.style.color = 'var(--text-secondary)';
    } else {
        notesEl.textContent = 'Keine Notizen erfasst.';
        notesEl.style.fontStyle = 'italic';
        notesEl.style.color = 'rgba(255,255,255,0.2)';
    }

    // Set buttons bindings
    const btnDel = document.getElementById('detail-btn-delete');
    btnDel.onclick = () => {
        hideOverlay('transaction-detail-dialog');
        confirmDeleteTransaction(id);
    };

    const btnEdit = document.getElementById('detail-btn-edit');
    btnEdit.onclick = () => {
        hideOverlay('transaction-detail-dialog');
        openTransactionDialog(id);
    };

    showOverlay('transaction-detail-dialog');
}

// ==================== ORIGINAL / COMPATIBLE RENDERING ====================
export function renderMonthsList() {
    // Left for compatibility if invoked in C# context, otherwise bypassed by activeTab
}

export function renderSummaryBox() {
    // Left for compatibility if invoked in C# context, otherwise bypassed by activeTab
}

export function renderTransactionsList() {
    // Left for compatibility if invoked in C# context, otherwise bypassed by activeTab
}

export function renderBuildingCosts() {
    const container = document.getElementById('baukosten-list');
    if (!container) return;
    container.innerHTML = '';
    
    if (!state.buildingCosts || state.buildingCosts.length === 0) {
        container.innerHTML = `<div class="info-box">Keine Baukosten-Einträge vorhanden.</div>`;
        return;
    }
    
    let totalAmount = 0;
    let paidAmount = 0;
    
    state.buildingCosts.forEach(item => {
        const amount = item.amount || item.Amount || 0;
        const isPaid = item.isPaid !== undefined ? item.isPaid : (item.IsPaid !== undefined ? item.IsPaid : false);
        
        totalAmount += amount;
        if (isPaid) {
            paidAmount += amount;
        }
    });
    
    const unpaidAmount = totalAmount - paidAmount;
    const progressPercent = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
    
    const totalEl = document.getElementById('baukosten-total');
    if (totalEl) totalEl.textContent = formatCurrency(totalAmount);
    const paidEl = document.getElementById('baukosten-paid');
    if (paidEl) paidEl.textContent = `+${formatCurrency(paidAmount)}`;
    const unpaidEl = document.getElementById('baukosten-unpaid');
    if (unpaidEl) unpaidEl.textContent = `-${formatCurrency(unpaidAmount)}`;
    const barEl = document.getElementById('baukosten-progress-bar');
    if (barEl) barEl.style.width = `${progressPercent}%`;
    
    const groups = {};
    state.buildingCosts.forEach(item => {
        const cat = item.category || item.Category || 'Sonstiges';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    });
    
    for (const category in groups) {
        const items = groups[category];
        
        let catTotal = 0;
        let catPaid = 0;
        items.forEach(item => {
            const amt = item.amount || item.Amount || 0;
            const paid = item.isPaid !== undefined ? item.isPaid : (item.IsPaid !== undefined ? item.IsPaid : false);
            catTotal += amt;
            if (paid) catPaid += amt;
        });
        
        const card = document.createElement('div');
        card.className = 'baukosten-category-card';
        
        let itemsHtml = '';
        items.forEach(item => {
            const name = item.name || item.Name || '';
            const amt = item.amount || item.Amount || 0;
            const paid = item.isPaid !== undefined ? item.isPaid : (item.IsPaid !== undefined ? item.IsPaid : false);
            const paidByRaw = item.paidBy || item.PaidBy || '';
            const paidBy = paidByRaw ? getAssignedDisplayName(paidByRaw) : '';
            const paymentDate = item.paymentDate || item.PaymentDate || null;
            
            const statusClass = paid ? 'paid' : 'unpaid';
            const statusIcon = paid ? '✓' : '•';
            let paidText = 'Offen';
            if (paid) {
                paidText = 'Bezahlt';
                if (paymentDate) {
                    const d = new Date(paymentDate);
                    if (!isNaN(d.getTime())) {
                        paidText += ` am ${d.toLocaleDateString('de-DE')}`;
                    }
                }
                if (paidBy) {
                    paidText += ` von ${paidBy}`;
                }
            }
            
            itemsHtml += `
                <div class="baukosten-item-row editable" data-bkid="${item.id || item.Id || ''}">
                    <div class="baukosten-item-left">
                        <div class="baukosten-item-status-icon ${statusClass}">
                            ${statusIcon}
                        </div>
                        <div class="baukosten-item-details">
                            <span class="baukosten-item-name">${escapeHtml(name)}</span>
                            <span class="baukosten-item-meta">${escapeHtml(paidText)}</span>
                        </div>
                    </div>
                    <div class="baukosten-item-right">
                        <span class="baukosten-item-amount">${formatCurrency(amt)}</span>
                        <span class="baukosten-item-paid-badge ${statusClass}">${paid ? 'Bezahlt' : 'Offen'}</span>
                    </div>
                </div>
            `;
        });
        
        card.innerHTML = `
            <div class="baukosten-category-header">
                <h4>${category}</h4>
                <div class="baukosten-category-header-right">
                    <div class="baukosten-category-header-amounts">
                        <span class="total-amount">${formatCurrency(catTotal)}</span>
                        <span class="paid-ratio">${formatCurrency(catPaid)} bezahlt</span>
                    </div>
                </div>
            </div>
            <div class="baukosten-items-list">
                ${itemsHtml}
            </div>
        `;

        // Antippen einer Position öffnet den Bearbeiten-Dialog
        card.querySelectorAll('.baukosten-item-row[data-bkid]').forEach(row => {
            const bkId = row.getAttribute('data-bkid');
            if (bkId) {
                row.addEventListener('click', () => openBuildingCostDialog(bkId));
            }
        });

        container.appendChild(card);
    }
}

// ==================== MONATSÜBERSICHT ====================
export function renderMonthsOverview() {
    const grid = document.getElementById('months-grid');
    if (!grid) return;

    const yearSel = document.getElementById('months-year');
    const partnerSel = document.getElementById('months-partner');
    const year = yearSel ? parseInt(yearSel.value) : new Date().getFullYear();
    const partnerFilter = partnerSel ? partnerSel.value : 'Alle';

    grid.innerHTML = '';

    // Alle 12 Monate berechnen (für Karten UND Diagramm)
    const allTotals = [];
    for (let m = 1; m <= 12; m++) {
        allTotals.push(computeMonthlyTotals(year, m, partnerFilter));
    }

    // Jahresvergleich-Balkendiagramm
    const chart = document.getElementById('months-chart');
    if (chart) {
        chart.innerHTML = '';
        const maxVal = Math.max(1, ...allTotals.map(t => Math.max(t.income, t.expenses)));
        for (let m = 1; m <= 12; m++) {
            const t = allTotals[m - 1];
            const incH = t.income > 0 ? Math.max(2, (t.income / maxVal) * 100) : 0;
            const expH = t.expenses > 0 ? Math.max(2, (t.expenses / maxVal) * 100) : 0;
            const group = document.createElement('div');
            group.className = 'month-bar-group' + (state.selectedOverviewMonth === m ? ' selected' : '');
            group.innerHTML = `
                <div class="month-bar-pair">
                    <div class="month-bar income" style="height:${incH}%;"></div>
                    <div class="month-bar expense" style="height:${expH}%;"></div>
                </div>
                <span class="month-bar-label">${MONTH_NAMES[m - 1].substring(0, 3)}</span>
            `;
            group.addEventListener('click', () => {
                state.selectedOverviewMonth = m;
                renderMonthsOverview();
            });
            chart.appendChild(group);
        }
    }

    let selectedResult = null;
    for (let m = 1; m <= 12; m++) {
        const totals = allTotals[m - 1];
        const surplus = totals.income - totals.expenses;
        const isSelected = state.selectedOverviewMonth === m;
        if (isSelected) selectedResult = totals;

        const card = document.createElement('div');
        card.className = 'month-card' + (isSelected ? ' selected' : '');
        card.innerHTML = `
            <div class="month-name">${MONTH_NAMES[m - 1]}</div>
            <div class="month-row"><span class="lbl">Einnahmen</span><span class="value income" style="font-size:11px;">+${formatCurrency(totals.income)}</span></div>
            <div class="month-row"><span class="lbl">Ausgaben</span><span class="value expense" style="font-size:11px;">-${formatCurrency(totals.expenses)}</span></div>
            <div class="month-surplus"><span>Saldo</span><span style="color:${surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)'};">${surplus >= 0 ? '+' : ''}${formatCurrency(surplus)}</span></div>
        `;
        card.addEventListener('click', () => {
            state.selectedOverviewMonth = m;
            renderMonthsOverview();
        });
        grid.appendChild(card);
    }

    // Detail-Liste für den gewählten Monat
    const list = document.getElementById('month-detail-list');
    const titleEl = document.getElementById('month-detail-title');
    const countEl = document.getElementById('month-detail-count');
    if (!list) return;
    list.innerHTML = '';

    const mIdx = state.selectedOverviewMonth;
    if (titleEl) titleEl.textContent = `Buchungen ${MONTH_NAMES[mIdx - 1]} ${year}`;

    const totals = selectedResult || computeMonthlyTotals(year, mIdx, partnerFilter);
    const rows = [];

    totals.varTransactions.forEach(t => rows.push({ ...t, rowKind: t.kind }));

    if (totals.fixedExpTotal > 0) {
        rows.push({
            title: 'Fixkosten (Ausgaben)',
            amount: totals.fixedExpTotal,
            isIncome: false,
            category: 'Wohnen',
            assignedTo: partnerFilter === 'Beide' ? 'Gemeinsam' : partnerFilter,
            date: new Date(year, mIdx - 1, 1),
            notes: 'Zusammengefasste fixe Ausgaben für diesen Monat.',
            rowKind: 'fixed-agg'
        });
    }

    totals.fixedIncomeRows.forEach(r => rows.push({ ...r, isIncome: true, rowKind: 'fixed-income' }));

    if (countEl) countEl.textContent = rows.length;

    if (rows.length === 0) {
        list.innerHTML = `<div class="no-transactions">Keine Buchungen in diesem Monat.</div>`;
        return;
    }

    rows.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        const icon = t.rowKind === 'fixed-agg' ? '📌' : getCategoryEmoji(t.category);
        const dateFormatted = t.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5 style="margin:0;">${escapeHtml(t.title)}</h5>
                    <div class="subtitle" style="font-size:10px;">${dateFormatted} • ${escapeHtml(getAssignedDisplayName(t.assignedTo))}</div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount ${t.isIncome ? 'income' : 'expense'}" style="font-weight:700;">
                    ${t.isIncome ? '+' : '-'}${formatCurrency(t.amount)}
                </span>
            </div>
        `;
        if (t.rowKind === 'var' && t.id) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => showTransactionDetails(t.id));
        }
        list.appendChild(item);
    });
}

// ==================== HAUSKOSTEN ====================
export function renderHouseExpenses() {
    const list = document.getElementById('hauskosten-list');
    if (!list) return;
    list.innerHTML = '';

    const items = state.houseExpenses || [];
    const total = getTotalHouseExpenses();
    const financing = items.filter(h => v(h, 'category') === 'Finanzierung').reduce((s, h) => s + parseFloat(v(h, 'amount') || 0), 0);
    const operating = items.filter(h => v(h, 'category') === 'Betriebskosten').reduce((s, h) => s + parseFloat(v(h, 'amount') || 0), 0);

    const totalEl = document.getElementById('hk-total');
    if (totalEl) totalEl.textContent = formatCurrency(total);
    const finEl = document.getElementById('hk-financing');
    if (finEl) finEl.textContent = formatCurrency(financing);
    const opEl = document.getElementById('hk-operating');
    if (opEl) opEl.textContent = formatCurrency(operating);
    const countEl = document.getElementById('hk-count');
    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
        list.innerHTML = `<div class="no-transactions">Keine Hauskosten-Positionen vorhanden.</div>`;
        return;
    }

    items.forEach(h => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.style.cursor = 'pointer';
        const cat = v(h, 'category') || 'Betriebskosten';
        const icon = cat === 'Finanzierung' ? '🏦' : '💡';
        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5 style="margin:0;">${escapeHtml(v(h, 'name') || '')}</h5>
                    <div class="subtitle" style="font-size:10px;">${escapeHtml(cat)}</div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount expense" style="font-weight:700;">-${formatCurrency(parseFloat(v(h, 'amount') || 0))}</span>
            </div>
        `;
        item.addEventListener('click', () => openHouseExpenseDialog(v(h, 'id')));
        list.appendChild(item);
    });
}

// ==================== SZENARIEN ====================
export function renderScenario() {
    const sc = getScenarioValues();

    // Eingabefelder füllen (nur wenn nicht gerade fokussiert, sonst tippt man gegen das Re-Rendern an)
    const setInput = (id, value) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) el.value = value;
    };
    const setCheck = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    };

    setCheck('sc-active', sc.isActive);
    setInput('sc-housing', sc.housingScenario);
    setInput('sc-rent', sc.rentAmount);
    setInput('sc-split', sc.p1SharePercent);
    setInput('sc-p1-income', sc.p1Income);
    setInput('sc-p2-income', sc.p2Income);
    setCheck('sc-baby', sc.isBabyActive);
    setCheck('sc-custom-eg', sc.useCustomEg);
    setInput('sc-eg-amount', sc.useCustomEg ? sc.customEg : sc.effectiveEg);
    setInput('sc-kindergeld', sc.kindergeld);
    setInput('sc-child-exp', sc.childExpenses);

    const egInput = document.getElementById('sc-eg-amount');
    if (egInput) egInput.disabled = !sc.useCustomEg;
    const egHint = document.getElementById('sc-elterngeld-hint');
    if (egHint) egHint.textContent = `Berechnet (65% vom Netto): ${formatCurrency(sc.calculatedEg)}`;

    const p1Label = document.getElementById('sc-p1-label');
    if (p1Label) p1Label.textContent = state.partner1Name;
    const p1IncLabel = document.getElementById('sc-p1-income-label');
    if (p1IncLabel) p1IncLabel.textContent = `Netto ${state.partner1Name} (€)`;
    const p2IncLabel = document.getElementById('sc-p2-income-label');
    if (p2IncLabel) p2IncLabel.textContent = `Netto ${state.partner2Name} (€)`;
    const splitHint = document.getElementById('sc-split-hint');
    if (splitHint) splitHint.textContent = `${state.partner2Name}: ${100 - sc.p1SharePercent}%`;

    // Simulation (Port von UpdateSimulatedCalculations)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const fixedList = state.fixedExpenses || [];

    const inRange = (f) => {
        const raw = v(f, 'startDate');
        if (!raw) return true;
        const sd = new Date(raw);
        if (isNaN(sd.getTime())) return true;
        return sd.getFullYear() < year || (sd.getFullYear() === year && (sd.getMonth() + 1) <= month);
    };

    const otherFixedIncome = fixedList
        .filter(f => v(f, 'isIncome') && v(f, 'category') !== 'Gehalt' && inRange(f))
        .reduce((s, f) => s + parseFloat(v(f, 'amount') || 0), 0);
    const otherFixedExpenses = fixedList
        .filter(f => !v(f, 'isIncome') && inRange(f) && !((v(f, 'category') === 'Wohnen') && ((v(f, 'title') || '').toLowerCase().includes('miete'))))
        .reduce((s, f) => s + parseFloat(v(f, 'amount') || 0), 0);

    const p2Term = sc.isBabyActive ? (sc.effectiveEg + sc.kindergeld) : sc.p2Income;
    const simIncome = sc.p1Income + p2Term + otherFixedIncome;
    const housingExpenses = sc.housingScenario === 'House' ? getTotalHouseExpenses() : sc.rentAmount;
    const simExpenses = housingExpenses + otherFixedExpenses + (sc.isBabyActive ? sc.childExpenses : 0);
    const surplus = simIncome - simExpenses;

    const incEl = document.getElementById('sc-sim-income');
    if (incEl) incEl.textContent = `+${formatCurrency(simIncome)}`;
    const expEl = document.getElementById('sc-sim-expenses');
    if (expEl) expEl.textContent = `-${formatCurrency(simExpenses)}`;
    const surEl = document.getElementById('sc-sim-surplus');
    if (surEl) {
        surEl.textContent = `${surplus >= 0 ? '+' : ''}${formatCurrency(surplus)}`;
        surEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    }

    // Verdikt wie am PC
    const box = document.getElementById('sc-verdict');
    const vTitle = document.getElementById('sc-verdict-title');
    const vText = document.getElementById('sc-verdict-text');
    if (box && vTitle && vText) {
        box.style.display = 'block';
        if (surplus >= 500) {
            box.className = 'verdict-box ok';
            vTitle.textContent = '✓ Finanziell tragbar';
            vText.textContent = 'Sehr solide! In diesem Szenario verbleibt nach Abzug aller Fixkosten ein komfortabler monatlicher Puffer für variable Ausgaben und Sparguthaben.';
        } else if (surplus >= 0) {
            box.className = 'verdict-box warn';
            vTitle.textContent = '⚠ Erhöhte Aufmerksamkeit nötig';
            vText.textContent = 'Knapp, aber tragbar. Der monatliche Überschuss ist gering — variable Ausgaben (Lebensmittel, Freizeit, etc.) genau budgetieren.';
        } else {
            box.className = 'verdict-box bad';
            vTitle.textContent = '✗ Finanzielles Defizit!';
            vText.textContent = `Achtung! Die geplanten Fixkosten übersteigen die Einnahmen um ${formatCurrency(Math.abs(surplus))} pro Monat.`;
        }
    }
}

export function populateCategoryDropdown() {
    const select = document.getElementById('field-category');
    const selectFixed = document.getElementById('fixed-field-category');
    const selectFilter = document.getElementById('filter-category');
    
    const curVal = select ? select.value : '';
    const curFixedVal = selectFixed ? selectFixed.value : '';
    
    if (state.budgetCategories && state.budgetCategories.length > 0) {
        const optionListHtml = state.budgetCategories.map(cat => {
            const name = cat.name || cat.Name;
            return `<option value="${name}">${name}</option>`;
        }).join('');
        
        if (select) {
            select.innerHTML = optionListHtml;
            if (state.budgetCategories.some(c => (c.name || c.Name) === curVal)) {
                select.value = curVal;
            } else {
                select.value = state.budgetCategories[0].name || state.budgetCategories[0].Name;
            }
        }
        
        if (selectFixed) {
            selectFixed.innerHTML = optionListHtml;
            if (state.budgetCategories.some(c => (c.name || c.Name) === curFixedVal)) {
                selectFixed.value = curFixedVal;
            } else {
                selectFixed.value = state.budgetCategories[0].name || state.budgetCategories[0].Name;
            }
        }

        if (selectFilter) {
            selectFilter.innerHTML = '<option value="All">Alle Kategorien</option>' + optionListHtml;
        }
    }
}

function showOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.add('active');
}

function hideOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.classList.remove('active');
}
