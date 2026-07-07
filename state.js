// Global State Management for Haushaltsbuch PWA
export const state = {
    mode: 'local', // 'local' or 'google'
    accessToken: null,
    fileId: null,
    clientId: localStorage.getItem('gdrive_client_id') || '',
    apiKey: localStorage.getItem('gdrive_api_key') || '',
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth() + 1, // 1-indexed (1-12)
    transactions: [],
    fixedExpenses: [], // Neu: Fixkosten
    loans: [], // Neu: Kredite
    editingTransactionId: null,
    deletingTransactionId: null,
    editingFixedExpenseId: null, // Neu
    deletingFixedExpenseId: null, // Neu
    selectedTransactionId: null, // Neu: Für Detailansicht
    selectedLoanId: null, // Neu: Für ausgewählten Kredit
    activeTab: 'dashboard',
    buildingCosts: [],
    buildingCostsFileId: localStorage.getItem('gdrive_building_costs_file_id') || null,
    fixedExpensesFileId: localStorage.getItem('gdrive_fixed_expenses_file_id') || null, // Neu
    loansFileId: localStorage.getItem('gdrive_loans_file_id') || null, // Neu
    scenarioSettingsFileId: localStorage.getItem('gdrive_scenario_settings_file_id') || null,
    scenarioSettings: {},
    budgetCategories: [], // Loaded dynamically from scenario_settings.json
    partner1Name: 'Markus',
    partner2Name: 'Maren'
};

export const MONTH_NAMES = [
    "Januar", "Februar", "März", "April", "Mai", "Juni", 
    "Juli", "August", "September", "Oktober", "November", "Dezember"
];

// Fallback Category Icons mapping (German name to Emoji)
export const DEFAULT_CATEGORY_ICONS = {
    "Gehalt": "💼",
    "Lebensmittel": "🛒",
    "Wohnen": "🏠",
    "Freizeit": "🎮",
    "Transport": "🚗",
    "Versicherungen": "🛡️",
    "Kredite": "🏦",
    "Sonstiges": "📦"
};

// Map Segoe MDL2 Windows Icons to Web Emojis
export const GLYPH_TO_EMOJI = {
    "\uE8A1": "💼", // Bank / Gehalt
    "\uE120": "🛒", // Einkaufen / Lebensmittel
    "\uE80F": "🏠", // Wohnen / Haus
    "\uE709": "🎮", // Spiele / Freizeit
    "\uE704": "🚗", // Auto / Transport
    "\uE97E": "✈️", // Urlaub / Flugzeug
    "\uEA18": "🛡️", // Schild / Versicherungen
    "\uE18B": "🏦", // Kredite / Geld
    "\uE8EC": "🏷️", // Sonstiges / Etikett
    "\uE7E7": "❤️", // Herz / Gesundheit
    "\uE1D0": "🎁", // Geschenk
    "\uE8CD": "📚", // Bildung / Buch
    "\uE756": "🍴", // Essen / Restaurant
    "\uE706": "☕", // Kaffee
    "\uE70E": "📱", // Telefon / Mobile
    "\uE7BE": "🗑️", // Müll / Utilities
    "\uE74C": "🔧", // Reparaturen / Werkzeug
    "\uE158": "🎉", // Feier / Party
    "\uE8B2": "👚", // Kleidung / Bügel
    "\uE7B5": "🐾", // Tiere / Pfote
    "\uE8C0": "💪", // Sport / Fitness
    "\uE7C3": "🌱", // Garten / Pflanzen
    "\uE722": "👶", // Kind / Baby
    "\uE91B": "📺", // Abo / Streaming
    "\uE8A5": "💳", // Kreditkarte
    "\uE825": "💵", // Bargeld
    "\uE9E9": "⚡", // Energie / Strom
    "\uE70B": "🎬", // Kino / Unterhaltung
    "\uE7C9": "💼", // Arbeit / Koffer
    "\uE774": "🛍️", // Online-Shopping
    "\uE9D9": "🛠️", // Werkzeuge
    "\uE768": "🎵", // Musik
    "\uEA0C": "💊", // Apotheke / Pille
    "\uE734": "⭐", // Stern / Favorit
    "\uE8B8": "⚙️", // Zahnrad / Einstellungen
    "\u20AC": "💶", // Euro
    "🍎": "🍎"
};

// Seed Mock Data
export const SEED_DATA = [
    { id: "s1", title: "Monatsgehalt", amount: 2800.00, isIncome: true, category: "Gehalt", date: new Date(new Date().setDate(new Date().getDate() - 10)).toISOString(), notes: "Reguläres Gehalt", assignedTo: "Partner 1", isFixedCost: false },
    { id: "s2", title: "Supermarkteinkauf", amount: 78.45, isIncome: false, category: "Lebensmittel", date: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString(), notes: "Wocheneinkauf", assignedTo: "Gemeinsam", isFixedCost: false },
    { id: "s3", title: "Tanken", amount: 65.00, isIncome: false, category: "Transport", date: new Date(new Date().setDate(new Date().getDate() - 4)).toISOString(), notes: "Benzin", assignedTo: "Partner 2", isFixedCost: false },
    { id: "s4", title: "Kinotickets", amount: 24.50, isIncome: false, category: "Freizeit", date: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(), notes: "Popcorn & Filme", assignedTo: "Gemeinsam", isFixedCost: false },
    { id: "s5", title: "Verkauf Kleinanzeigen", amount: 50.00, isIncome: true, category: "Sonstiges", date: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(), notes: "Alte Lampe verkauft", assignedTo: "Partner 1", isFixedCost: false }
];

export function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function formatCurrency(val) {
    return `${val.toFixed(2).replace('.', ',')} €`;
}

export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Local Storage Handlers (Test-Modus)
export function loadTransactionsFromLocal() {
    let saved = localStorage.getItem('local_transactions');
    if (saved) {
        state.transactions = JSON.parse(saved);
    } else {
        state.transactions = SEED_DATA;
        localStorage.setItem('local_transactions', JSON.stringify(SEED_DATA));
    }
}

export function saveTransactionsToLocal() {
    localStorage.setItem('local_transactions', JSON.stringify(state.transactions));
}

// Helper to get Category Emoji
export function getCategoryEmoji(catName) {
    if (!state.budgetCategories || state.budgetCategories.length === 0) {
        return DEFAULT_CATEGORY_ICONS[catName] || '📦';
    }
    const cat = state.budgetCategories.find(c => c.name === catName || c.Name === catName);
    if (cat) {
        const glyph = cat.iconGlyph || cat.IconGlyph;
        return GLYPH_TO_EMOJI[glyph] || glyph || '📦';
    }
    return DEFAULT_CATEGORY_ICONS[catName] || '📦';
}

// Local Storage for Fixed Expenses
export function loadFixedExpensesFromLocal() {
    let saved = localStorage.getItem('local_fixed_expenses');
    if (saved) {
        state.fixedExpenses = JSON.parse(saved);
    } else {
        state.fixedExpenses = [
            { id: "f1", title: "Miete", amount: 850.00, isIncome: false, category: "Wohnen", dayOfMonth: 1, assignedTo: "Gemeinsam", notes: "Monatliche Kaltmiete" },
            { id: "f2", title: "Kindergeld", amount: 250.00, isIncome: true, category: "Gehalt", dayOfMonth: 5, assignedTo: "Gemeinsam", notes: "" },
            { id: "f3", title: "Fitnessstudio", amount: 29.90, isIncome: false, category: "Freizeit", dayOfMonth: 15, assignedTo: "Partner 1", notes: "Mitgliedschaft" }
        ];
        localStorage.setItem('local_fixed_expenses', JSON.stringify(state.fixedExpenses));
    }
}

export function saveFixedExpensesToLocal() {
    localStorage.setItem('local_fixed_expenses', JSON.stringify(state.fixedExpenses));
}

// Local Storage for Loans
export function loadLoansFromLocal() {
    let saved = localStorage.getItem('local_loans');
    if (saved) {
        state.loans = JSON.parse(saved);
    } else {
        state.loans = [
            { 
                id: "l1", 
                name: "Sparkasse Hauskredit", 
                loanType: "Hausbaukredit", 
                loanAmount: 250000.00, 
                interestRate: 3.25, 
                repaymentRate: 2.0, 
                startDate: "2024-01-01", 
                firstPaymentDate: "2024-02-01", 
                fixedTermYears: 10, 
                notes: "Hauptkredit Hausbau",
                assignedTo: "Gemeinsam",
                includeInFixedCosts: true,
                oneTimeSondertilgungen: [
                    { year: 2, amount: 5000, isApplied: true },
                    { year: 5, amount: 10000, isApplied: true }
                ]
            },
            { 
                id: "l2", 
                name: "Autokredit", 
                loanType: "Ratenkredit", 
                loanAmount: 18000.00, 
                interestRate: 4.99, 
                plannedTermMonths: 48, 
                startDate: "2025-06-01", 
                firstPaymentDate: "2025-07-01",
                notes: "Ratenzahlung Familienauto",
                assignedTo: "Gemeinsam",
                includeInFixedCosts: true
            }
        ];
        localStorage.setItem('local_loans', JSON.stringify(state.loans));
    }
    // Calculate simulated values
    state.loans.forEach(loan => updateSingleLoanCalculations(loan));
}

export function saveLoansToLocal() {
    localStorage.setItem('local_loans', JSON.stringify(state.loans));
}

// ==================== LOAN SIMULATION ENGINE (C# ALIGNMENT) ====================
export function calculateCustomFirstMonthInterest(loan) {
    const loanType = loan.loanType || loan.LoanType;
    const customMonthlyRate = parseFloat(loan.customMonthlyRate || loan.CustomMonthlyRate || 0);
    const customSchlussrate = parseFloat(loan.customSchlussrate || loan.CustomSchlussrate || 0);
    const plannedTermMonths = parseInt(loan.plannedTermMonths || loan.PlannedTermMonths || 0);
    const loanAmount = parseFloat(loan.loanAmount || loan.LoanAmount || 0);
    const interestRate = parseFloat(loan.interestRate || loan.InterestRate || 0);

    if (loanType !== "Ratenkredit" || customMonthlyRate <= 0 || customSchlussrate <= 0 || plannedTermMonths <= 0) {
        return 0;
    }

    const annualInterestRate = interestRate / 100;
    let low = 0;
    let high = loanAmount * 0.2;
    let bestFirstMonthInterest = 0;

    for (let step = 0; step < 40; step++) {
        let mid = (low + high) / 2;
        let debt = loanAmount;

        // Month 1
        let interestM1 = mid;
        let repaymentM1 = customMonthlyRate - interestM1;
        debt = Math.round((debt - repaymentM1) * 100) / 100;

        for (let t = 2; t < plannedTermMonths; t++) {
            let interest = Math.round((debt * (annualInterestRate / 12)) * 100) / 100;
            let repayment = customMonthlyRate - interest;
            debt = Math.round((debt - repayment) * 100) / 100;
        }

        let lastInterest = Math.round((debt * (annualInterestRate / 12)) * 100) / 100;
        let schlussrate = debt + lastInterest;

        if (schlussrate < customSchlussrate) {
            low = mid;
        } else {
            high = mid;
        }
        bestFirstMonthInterest = mid;
    }

    return Math.round(bestFirstMonthInterest * 100) / 100;
}

export function runAnnuitySimulation(loan, applySondertilgung) {
    const loanAmount = parseFloat(loan.loanAmount || loan.LoanAmount || 0);
    const monthlyRate = parseFloat(loan.monthlyRate || loan.MonthlyRate || 0);
    const interestRate = parseFloat(loan.interestRate || loan.InterestRate || 0);
    const loanType = loan.loanType || loan.LoanType || "Hausbaukredit";
    const fixedTermYears = parseInt(loan.fixedTermYears || loan.FixedTermYears || 10);
    const plannedTermMonths = parseInt(loan.plannedTermMonths || loan.PlannedTermMonths || 0);
    const customMonthlyRate = parseFloat(loan.customMonthlyRate || loan.CustomMonthlyRate || 0);
    const customSchlussrate = parseFloat(loan.customSchlussrate || loan.CustomSchlussrate || 0);
    const startDateStr = loan.startDate || loan.StartDate || new Date().toISOString();
    const firstPaymentDateStr = loan.firstPaymentDate || loan.FirstPaymentDate || new Date().toISOString();

    const result = {
        remainingDebtAfterFixedTerm: 0,
        totalInterestInFixedTerm: 0,
        totalInterestOverall: 0,
        totalMonthsOverall: 0,
        yearlyRows: []
    };

    let currentDebt = loanAmount;
    let annualInterestRate = interestRate / 100;
    let fixedTermMonths = loanType === "Ratenkredit" ? plannedTermMonths : fixedTermYears * 12;

    let totalInterestInFixedTerm = 0;
    let totalInterestOverall = 0;
    let totalMonths = 0;

    let yearStartDebt = currentDebt;
    let yearInterestPaid = 0;
    let yearRepaymentPaid = 0;
    let yearSondertilgungPaid = 0;

    let currentYearIndex = 1;

    const hasCustomRates = (loanType === "Ratenkredit" && customMonthlyRate > 0 && customSchlussrate > 0 && plannedTermMonths > 0);
    const customFirstMonthInterest = hasCustomRates ? calculateCustomFirstMonthInterest(loan) : 0;

    let gapMonths = 0;
    if (!hasCustomRates) {
        const start = new Date(startDateStr);
        const first = new Date(firstPaymentDateStr);
        gapMonths = ((first.getFullYear() - start.getFullYear()) * 12) + first.getMonth() - start.getMonth();
        if (gapMonths < 0) gapMonths = 0;
    }

    // Gap simulation
    for (let m = 0; m < gapMonths; m++) {
        totalMonths++;
        let interest = Math.round((currentDebt * annualInterestRate / 12) * 100) / 100;
        currentDebt = Math.round((currentDebt + interest) * 100) / 100;

        yearInterestPaid += interest;
        totalInterestOverall += interest;

        if (totalMonths <= fixedTermMonths) {
            totalInterestInFixedTerm += interest;
        }

        if (totalMonths % 12 === 0) {
            result.yearlyRows.push({
                period: `Jahr ${currentYearIndex}`,
                startBalance: yearStartDebt,
                interestPaid: yearInterestPaid,
                repaymentPaid: yearRepaymentPaid,
                sondertilgungPaid: yearSondertilgungPaid,
                endBalance: currentDebt
            });

            yearStartDebt = currentDebt;
            yearInterestPaid = 0;
            yearRepaymentPaid = 0;
            yearSondertilgungPaid = 0;
            currentYearIndex++;
        }
    }

    const oneTimeSondertilgungen = loan.oneTimeSondertilgungen || loan.OneTimeSondertilgungen || [];

    // Payment simulation
    while (currentDebt > 0 && totalMonths < 600) {
        totalMonths++;

        let interest = 0;
        if (hasCustomRates && totalMonths === 1) {
            interest = customFirstMonthInterest;
        } else {
            interest = Math.round((currentDebt * annualInterestRate / 12) * 100) / 100;
        }

        if (interest > currentDebt) interest = currentDebt;

        let payment = monthlyRate;
        const isFinalMonth = (loanType === "Ratenkredit" && (totalMonths - gapMonths) >= plannedTermMonths);

        if (isFinalMonth || currentDebt + interest <= payment) {
            payment = currentDebt + interest;
        }

        let repayment = payment - interest;
        if (repayment < 0) repayment = 0;

        if (currentDebt - repayment <= 0) {
            repayment = currentDebt;
            currentDebt = 0;
        } else {
            currentDebt = Math.round((currentDebt - repayment) * 100) / 100;
        }

        yearInterestPaid += interest;
        yearRepaymentPaid += repayment;
        totalInterestOverall += interest;

        if (totalMonths <= fixedTermMonths) {
            totalInterestInFixedTerm += interest;
        }

        // Apply Sondertilgung at the end of each year
        if (currentDebt > 0 && totalMonths % 12 === 0) {
            let sondertilgung = 0;

            if (oneTimeSondertilgungen.length > 0) {
                oneTimeSondertilgungen.forEach(item => {
                    const yr = item.year !== undefined ? item.year : item.Year;
                    const amt = parseFloat(item.amount !== undefined ? item.amount : item.Amount || 0);
                    const isApp = item.isApplied !== undefined ? item.isApplied : (item.IsApplied !== undefined ? item.IsApplied : true);

                    if (yr === currentYearIndex) {
                        if (applySondertilgung || isApp) {
                            sondertilgung += amt;
                        }
                    }
                });
            }

            if (sondertilgung > 0) {
                if (sondertilgung > currentDebt) {
                    sondertilgung = currentDebt;
                }
                currentDebt = Math.round((currentDebt - sondertilgung) * 100) / 100;
                yearSondertilgungPaid += sondertilgung;
            }
        }

        // End of Zinsbindung capture
        if (totalMonths === fixedTermMonths) {
            result.remainingDebtAfterFixedTerm = currentDebt;
        }

        // Year-end row reporting
        if (totalMonths % 12 === 0 || currentDebt === 0) {
            result.yearlyRows.push({
                period: `Jahr ${currentYearIndex}`,
                startBalance: yearStartDebt,
                interestPaid: yearInterestPaid,
                repaymentPaid: yearRepaymentPaid,
                sondertilgungPaid: yearSondertilgungPaid,
                endBalance: currentDebt
            });

            yearStartDebt = currentDebt;
            yearInterestPaid = 0;
            yearRepaymentPaid = 0;
            yearSondertilgungPaid = 0;
            
            if (currentDebt > 0 || totalMonths % 12 === 0) {
                currentYearIndex++;
            }
        }
    }

    if (totalMonths < fixedTermMonths) {
        result.remainingDebtAfterFixedTerm = 0;
    }

    result.totalInterestInFixedTerm = totalInterestInFixedTerm;
    result.totalInterestOverall = totalInterestOverall;
    result.totalMonthsOverall = totalMonths;

    return result;
}

export function updateSingleLoanCalculations(loan) {
    const loanAmount = parseFloat(loan.loanAmount || loan.LoanAmount || 0);
    const interestRate = parseFloat(loan.interestRate || loan.InterestRate || 0);
    const startDateStr = loan.startDate || loan.StartDate || new Date().toISOString();
    const firstPaymentDateStr = loan.firstPaymentDate || loan.FirstPaymentDate || new Date().toISOString();
    const loanType = loan.loanType || loan.LoanType || "Hausbaukredit";
    const plannedTermMonths = parseInt(loan.plannedTermMonths || loan.PlannedTermMonths || 0);
    const fixedTermYears = parseInt(loan.fixedTermYears || loan.FixedTermYears || 10);
    const customMonthlyRate = parseFloat(loan.customMonthlyRate || loan.CustomMonthlyRate || 0);

    // Calculate default MonthlyRate if not custom or loaded
    let monthlyRate = parseFloat(loan.monthlyRate || loan.MonthlyRate || 0);
    if (monthlyRate <= 0) {
        if (customMonthlyRate > 0) {
            monthlyRate = customMonthlyRate;
        } else if (loanType === "Ratenkredit") {
            const p = loanAmount;
            const r = interestRate / 100 / 12;
            const n = plannedTermMonths;
            if (r === 0) {
                monthlyRate = Math.round((loanAmount / n) * 100) / 100;
            } else {
                const rate = (r * p) / (1 - Math.pow(1 + r, -n));
                monthlyRate = Math.round(rate * 100) / 100;
            }
        } else {
            const repaymentRate = parseFloat(loan.repaymentRate || loan.RepaymentRate || 2.0);
            const calculated = loanAmount * (interestRate + repaymentRate) / 100 / 12;
            monthlyRate = Math.round(calculated * 100) / 100;
        }
        loan.monthlyRate = monthlyRate;
        loan.MonthlyRate = monthlyRate;
    }

    const annualInterestRate = interestRate / 100;
    
    const start = new Date(startDateStr);
    const today = new Date();
    let elapsedMonths = ((today.getFullYear() - start.getFullYear()) * 12) + today.getMonth() - start.getMonth();
    if (elapsedMonths < 0) elapsedMonths = 0;

    let currentDebt = loanAmount;
    let totalInterestPaid = 0;
    let totalInterestFuture = 0;
    let remainingDebtToday = loanAmount;
    let totalMonths = 0;

    const hasCustomRates = (loanType === "Ratenkredit" && customMonthlyRate > 0 && parseFloat(loan.customSchlussrate || loan.CustomSchlussrate || 0) > 0 && plannedTermMonths > 0);
    const customFirstMonthInterest = hasCustomRates ? calculateCustomFirstMonthInterest(loan) : 0;

    let gapMonths = 0;
    if (!hasCustomRates) {
        const first = new Date(firstPaymentDateStr);
        gapMonths = ((first.getFullYear() - start.getFullYear()) * 12) + first.getMonth() - start.getMonth();
        if (gapMonths < 0) gapMonths = 0;
    }

    // Gap simulation
    for (let m = 0; m < gapMonths; m++) {
        totalMonths++;
        let interest = Math.round((currentDebt * annualInterestRate / 12) * 100) / 100;
        currentDebt = Math.round((currentDebt + interest) * 100) / 100;

        if (totalMonths <= elapsedMonths) {
            totalInterestPaid += interest;
        } else {
            totalInterestFuture += interest;
        }

        if (totalMonths === elapsedMonths) {
            remainingDebtToday = currentDebt;
        }
    }

    const oneTimeSondertilgungen = loan.oneTimeSondertilgungen || loan.OneTimeSondertilgungen || [];
    let currentYearIndex = 1;

    // Payment simulation
    while (currentDebt > 0 && totalMonths < 600) {
        totalMonths++;

        let interest = 0;
        if (hasCustomRates && totalMonths === 1) {
            interest = customFirstMonthInterest;
        } else {
            interest = Math.round((currentDebt * annualInterestRate / 12) * 100) / 100;
        }

        if (interest > currentDebt) interest = currentDebt;

        let payment = monthlyRate;
        const isFinalMonth = (loanType === "Ratenkredit" && (totalMonths - gapMonths) >= plannedTermMonths);

        if (isFinalMonth || currentDebt + interest <= payment) {
            payment = currentDebt + interest;
        }

        let repayment = payment - interest;
        if (repayment < 0) repayment = 0;

        if (currentDebt - repayment <= 0) {
            repayment = currentDebt;
            currentDebt = 0;
        } else {
            currentDebt = Math.round((currentDebt - repayment) * 100) / 100;
        }

        if (totalMonths <= elapsedMonths) {
            totalInterestPaid += interest;
        } else {
            totalInterestFuture += interest;
        }

        // Apply Sondertilgung at the end of each year
        if (currentDebt > 0 && totalMonths % 12 === 0) {
            let sondertilgung = 0;
            if (oneTimeSondertilgungen.length > 0) {
                oneTimeSondertilgungen.forEach(item => {
                    const yr = item.year !== undefined ? item.year : item.Year;
                    const amt = parseFloat(item.amount !== undefined ? item.amount : item.Amount || 0);
                    const isApp = item.isApplied !== undefined ? item.isApplied : (item.IsApplied !== undefined ? item.IsApplied : true);

                    if (yr === currentYearIndex && isApp) {
                        sondertilgung += amt;
                    }
                });
            }

            if (sondertilgung > 0) {
                if (sondertilgung > currentDebt) {
                    sondertilgung = currentDebt;
                }
                currentDebt = Math.round((currentDebt - sondertilgung) * 100) / 100;
            }
        }

        if (totalMonths === elapsedMonths) {
            remainingDebtToday = currentDebt;
        }

        if (totalMonths % 12 === 0 || currentDebt === 0) {
            currentYearIndex++;
        }
    }

    if (elapsedMonths >= totalMonths) {
        remainingDebtToday = 0;
    }

    loan.RemainingDebtToday = remainingDebtToday;
    loan.remainingDebtToday = remainingDebtToday;
    loan.TotalInterestPaidEuro = totalInterestPaid;
    loan.totalInterestPaidEuro = totalInterestPaid;
    loan.TotalInterestFutureEuro = totalInterestFuture;
    loan.totalInterestFutureEuro = totalInterestFuture;

    let remainingMonths = totalMonths - elapsedMonths;
    if (remainingMonths < 0) remainingMonths = 0;

    let remainingTermText = "Abbezahlt";
    if (remainingMonths > 0) {
        if (loanType === "Ratenkredit") {
            remainingTermText = `${remainingMonths} Monate`;
        } else {
            const remainingYears = Math.floor(remainingMonths / 12);
            const remainingRestMonths = remainingMonths % 12;
            if (remainingYears === 0) {
                remainingTermText = `${remainingRestMonths} Mon.`;
            } else {
                remainingTermText = `${remainingYears} J., ${remainingRestMonths} Mon.`;
            }
        }
    }
    loan.RemainingTermText = remainingTermText;
    loan.remainingTermText = remainingTermText;
}
