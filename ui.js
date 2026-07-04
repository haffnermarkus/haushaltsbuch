import { state, MONTH_NAMES, escapeHtml, formatCurrency, getCategoryEmoji } from './state.js';
import { openTransactionDialog, confirmDeleteTransaction } from './app.js';

export function updateDataViews() {
    renderMonthsList();
    renderTransactionsList();
    renderSummaryBox();
}

export function renderMonthsList() {
    const container = document.getElementById('months-list');
    if (!container) return;
    container.innerHTML = '';
    
    const year = state.selectedYear;
    
    for (let m = 1; m <= 12; m++) {
        const monthTrans = state.transactions.filter(t => {
            if (t.isDeleted || t.IsDeleted) return false;
            if (t.isFixedCost || t.IsFixedCost) return false;
            const d = new Date(t.date || t.Date);
            return d.getFullYear() === year && (d.getMonth() + 1) === m;
        });
        
        const income = monthTrans.filter(t => t.isIncome || t.IsIncome).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
        const expenses = monthTrans.filter(t => !(t.isIncome || t.IsIncome)).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
        const surplus = income - expenses;
        
        const card = document.createElement('div');
        card.className = `month-card ${state.selectedMonth === m ? 'selected' : ''}`;
        card.addEventListener('click', () => {
            state.selectedMonth = m;
            updateDataViews();
        });
        
        card.innerHTML = `
            <h4>${MONTH_NAMES[m - 1]}</h4>
            <div class="month-card-stats">
                <span class="income">+${income.toFixed(2)} €</span>
                <span class="expense">-${expenses.toFixed(2)} €</span>
            </div>
            <span class="surplus" style="color: ${surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)'}">
                ${surplus >= 0 ? '+' : ''}${surplus.toFixed(2)} €
            </span>
        `;
        container.appendChild(card);
    }
}

export function renderSummaryBox() {
    const year = state.selectedYear;
    const month = state.selectedMonth;
    
    const labelEl = document.getElementById('selected-month-label');
    if (labelEl) labelEl.textContent = `${MONTH_NAMES[month - 1]} ${year}`;
    
    const monthTrans = state.transactions.filter(t => {
        if (t.isDeleted || t.IsDeleted) return false;
        if (t.isFixedCost || t.IsFixedCost) return false;
        const d = new Date(t.date || t.Date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    
    const income = monthTrans.filter(t => t.isIncome || t.IsIncome).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
    const expenses = monthTrans.filter(t => !(t.isIncome || t.IsIncome)).reduce((sum, t) => sum + parseFloat(t.amount || t.Amount || 0), 0);
    const surplus = income - expenses;
    
    const incEl = document.getElementById('stat-income');
    if (incEl) incEl.textContent = `+${income.toFixed(2).replace('.', ',')} €`;
    
    const expEl = document.getElementById('stat-expenses');
    if (expEl) expEl.textContent = `-${expenses.toFixed(2).replace('.', ',')} €`;
    
    const surplusEl = document.getElementById('stat-surplus');
    if (surplusEl) {
        surplusEl.textContent = `${surplus >= 0 ? '+' : ''}${surplus.toFixed(2).replace('.', ',')} €`;
        surplusEl.style.color = surplus >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
    }
}

export function renderTransactionsList() {
    const container = document.getElementById('transactions-list');
    if (!container) return;
    container.innerHTML = '';
    
    const year = state.selectedYear;
    const month = state.selectedMonth;
    
    const monthTrans = state.transactions.filter(t => {
        if (t.isDeleted || t.IsDeleted) return false;
        if (t.isFixedCost || t.IsFixedCost) return false;
        const d = new Date(t.date || t.Date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    
    monthTrans.sort((a, b) => new Date(b.date || b.Date) - new Date(a.date || a.Date));
    
    const countEl = document.getElementById('transaction-count');
    if (countEl) countEl.textContent = monthTrans.length;
    
    if (monthTrans.length === 0) {
        container.innerHTML = `
            <div class="no-transactions">
                Keine Buchungen für diesen Monat erfasst.<br>Tippen Sie auf das "+"-Symbol, um eine neue Buchung hinzuzufügen.
            </div>
        `;
        return;
    }
    
    monthTrans.forEach(t => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        
        const dateFormatted = new Date(t.date || t.Date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const cat = t.category || t.Category || 'Sonstiges';
        const icon = getCategoryEmoji(cat);
        const title = t.title || t.Title || '';
        const assignedTo = t.assignedTo || t.AssignedTo || 'Gemeinsam';
        const amount = t.amount || t.Amount || 0;
        const isIncome = t.isIncome !== undefined ? t.isIncome : (t.IsIncome !== undefined ? t.IsIncome : false);
        
        item.innerHTML = `
            <div class="transaction-left">
                <div class="category-icon">${icon}</div>
                <div class="transaction-details">
                    <h5>${escapeHtml(title)}</h5>
                    <div class="subtitle">
                        <span>${dateFormatted}</span>
                        <span class="subtitle-badge">${escapeHtml(assignedTo)}</span>
                    </div>
                </div>
            </div>
            <div class="transaction-right">
                <span class="amount ${isIncome ? 'income' : 'expense'}">
                    ${isIncome ? '+' : '-'}${parseFloat(amount).toFixed(2).replace('.', ',')} €
                </span>
                <div class="transaction-actions">
                    <button class="action-btn edit" data-id="${t.id || t.Id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                    </button>
                    <button class="action-btn delete" data-id="${t.id || t.Id}">
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        
        item.querySelector('.edit').addEventListener('click', (e) => {
            e.stopPropagation();
            openTransactionDialog(t.id || t.Id);
        });
        item.querySelector('.delete').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteTransaction(t.id || t.Id);
        });
        
        container.appendChild(item);
    });
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
    
    document.getElementById('baukosten-total').textContent = formatCurrency(totalAmount);
    document.getElementById('baukosten-paid').textContent = `+${formatCurrency(paidAmount)}`;
    document.getElementById('baukosten-unpaid').textContent = `-${formatCurrency(unpaidAmount)}`;
    document.getElementById('baukosten-progress-bar').style.width = `${progressPercent}%`;
    
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
            const paidBy = item.paidBy || item.PaidBy || '';
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

// Dynamically populates Category dropdown in the Dialog
export function populateCategoryDropdown() {
    const select = document.getElementById('field-category');
    if (!select) return;
    
    // Save current selected value
    const curVal = select.value;
    
    if (state.budgetCategories && state.budgetCategories.length > 0) {
        select.innerHTML = '';
        state.budgetCategories.forEach(cat => {
            const opt = document.createElement('option');
            const name = cat.name || cat.Name;
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
        // Select old or fallback
        if (state.budgetCategories.some(c => (c.name || c.Name) === curVal)) {
            select.value = curVal;
        } else {
            select.value = state.budgetCategories[0].name || state.budgetCategories[0].Name;
        }
    }
}
