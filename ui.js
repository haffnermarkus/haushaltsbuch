import { 
    state, 
    MONTH_NAMES, 
    escapeHtml, 
    formatCurrency, 
    getCategoryEmoji, 
    runAnnuitySimulation, 
    updateSingleLoanCalculations 
} from './state.js';

export function getAssignedDisplayName(assigned) {
    if (assigned === 'Partner 1') return state.partner1Name || 'Markus';
    if (assigned === 'Partner 2') return state.partner2Name || 'Maren';
    return assigned || 'Gemeinsam';
}

export function updatePartnerDropdowns() {
    const p1Name = state.partner1Name || 'Markus';
    const p2Name = state.partner2Name || 'Maren';

    const filterSelect = document.getElementById('filter-assigned');
    if (filterSelect) {
        const p1Opt = filterSelect.querySelector('option[value="Partner 1"]');
        if (p1Opt) p1Opt.textContent = p1Name;
        const p2Opt = filterSelect.querySelector('option[value="Partner 2"]');
        if (p2Opt) p2Opt.textContent = p2Name;
    }

    const fieldSelect = document.getElementById('field-assigned');
    if (fieldSelect) {
        const p1Opt = fieldSelect.querySelector('option[value="Partner 1"]');
        if (p1Opt) p1Opt.textContent = p1Name;
        const p2Opt = fieldSelect.querySelector('option[value="Partner 2"]');
        if (p2Opt) p2Opt.textContent = p2Name;
    }

    const fixedSelect = document.getElementById('fixed-field-assigned');
    if (fixedSelect) {
        const p1Opt = fixedSelect.querySelector('option[value="Partner 1"]');
        if (p1Opt) p1Opt.textContent = p1Name;
        const p2Opt = fixedSelect.querySelector('option[value="Partner 2"]');
        if (p2Opt) p2Opt.textContent = p2Name;
    }
}

import { 
    openTransactionDialog, 
    confirmDeleteTransaction,
    openFixedExpenseDialog,
    confirmDeleteFixedExpense
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

    const filtered = state.transactions.filter(t => {
        if (t.isDeleted || t.IsDeleted) return false;
        if (t.isFixedCost || t.IsFixedCost) return false;

        // Search text
        const title = (t.title || t.Title || '').toLowerCase();
        const notes = (t.notes || t.Notes || '').toLowerCase();
        if (searchVal && !title.includes(searchVal) && !notes.includes(searchVal)) return false;

        // Date
        const d = new Date(t.date || t.Date);
        if (yearVal !== 'All' && d.getFullYear().toString() !== yearVal) return false;
        if (monthVal !== 'All' && (d.getMonth() + 1).toString() !== monthVal) return false;

        // Category
        const cat = t.category || t.Category || 'Sonstiges';
        if (catVal !== 'All' && cat !== catVal) return false;

        // Assigned To
        const assigned = t.assignedTo || t.AssignedTo || 'Gemeinsam';
        if (assignVal !== 'All' && assigned !== assignVal) return false;

        return true;
    });

    // Sort descending by date
    filtered.sort((a, b) => new Date(b.date || b.Date) - new Date(a.date || a.Date));

    // Calculate aggregates
    const income = filtered.filter(t => t.isIncome || t.IsIncome).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
    const expenses = filtered.filter(t => !(t.isIncome || t.IsIncome)).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
    const surplus = income - expenses;

    document.getElementById('filter-transaction-count').textContent = filtered.length;
    document.getElementById('filter-sum-income').textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    document.getElementById('filter-sum-expense').textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;
    
    const surplusEl = document.getElementById('filter-sum-surplus');
    surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
    surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

    if (filtered.length === 0) {
        container.innerHTML = `<div class="no-transactions">Keine Buchungen mit diesen Filterkriterien gefunden.</div>`;
        return;
    }

    filtered.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.style.cursor = 'pointer';
        
        const date = new Date(t.date || t.Date);
        const dateFormatted = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
        container.appendChild(item);
    });
}

// ==================== FIXED EXPENSES (FIXKOSTEN) ====================
export function renderFixedExpenses() {
    const container = document.getElementById('fixed-expenses-list');
    if (!container) return;
    container.innerHTML = '';

    const list = state.fixedExpenses || [];

    // Sort by day of month
    list.sort((a, b) => parseInt(a.dayOfMonth || a.DayOfMonth || 1) - parseInt(b.dayOfMonth || b.DayOfMonth || 1));

    // Calculate aggregates
    const income = list.filter(f => f.isIncome || f.IsIncome).reduce((sum, f) => sum + parseFloat(f.amount || f.Amount || 0), 0);
    const expenses = list.filter(f => !(f.isIncome || f.IsIncome)).reduce((sum, f) => sum + parseFloat(f.amount || f.Amount || 0), 0);
    const surplus = income - expenses;

    document.getElementById('fixed-expenses-count').textContent = list.length;
    document.getElementById('fixed-total-income').textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    document.getElementById('fixed-total-expenses').textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;

    const surplusEl = document.getElementById('fixed-total-surplus');
    surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
    surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';

    if (list.length === 0) {
        container.innerHTML = `<div class="no-transactions">Keine Fixkosten-Buchungen angelegt.</div>`;
        return;
    }

    list.forEach(f => {
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
                <div class="summary-details" style="grid-template-columns: repeat(2, 1fr); gap:12px 8px;">
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
                <div class="baukosten-item-row">
                    <div class="baukosten-item-left">
                        <div class="baukosten-item-status-icon ${statusClass}">
                            ${statusIcon}
                        </div>
                        <div class="baukosten-item-details">
                            <span class="baukosten-item-name">${name}</span>
                            <span class="baukosten-item-meta">${paidText}</span>
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
        
        container.appendChild(card);
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
