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
    houseExpenses: [],
    houseExpensesFileId: localStorage.getItem('gdrive_house_expenses_file_id') || null,
    editingHouseExpenseId: null,
    editingBuildingCostId: null,
    selectedOverviewMonth: new Date().getMonth() + 1, // Monatsübersicht: gewählter Monat
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

// ==================== FELD-ZUGRIFF (camelCase/PascalCase) ====================
// Die Desktop-App schrieb historisch PascalCase, inzwischen camelCase.
// v(obj, 'amount') liest beide Varianten.
export function v(obj, key) {
    if (!obj) return undefined;
    if (obj[key] !== undefined) return obj[key];
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    return obj[pascal];
}

// Setzt ein Feld in BEIDEN Schreibweisen (Kompatibilität mit alten Dateien).
export function setV(obj, key, value) {
    obj[key] = value;
    const pascal = key.charAt(0).toUpperCase() + key.slice(1);
    if (obj[pascal] !== undefined || key !== pascal) {
        obj[pascal] = value;
    }
}

// ==================== HAUSKOSTEN ====================
// Standardliste identisch zur Desktop-App (GetDefaultHouseExpenses)
export function getDefaultHouseExpenses() {
    const mk = (name, category, amount, notes) => ({ id: generateUUID(), name, category, amount, notes });
    return [
        mk("Kreditrate (Zins & Tilgung)", "Finanzierung", 1250.00, "Monatliche Annuität für das Baudarlehen"),
        mk("Instandhaltungsrücklage", "Finanzierung", 200.00, "Rücklage für zukünftige Reparaturen"),
        mk("Strom (Heizung & Haushalt)", "Betriebskosten", 120.00, "Stromkosten inkl. Wärmepumpe/Heizung"),
        mk("Heizung / Gas / Fernwärme", "Betriebskosten", 150.00, "Falls keine Wärmepumpe genutzt wird"),
        mk("Wasser / Abwasser", "Betriebskosten", 60.00, "Frischwasser und Kanalgebühren"),
        mk("Grundsteuer", "Betriebskosten", 35.00, "Vierteljährliche Abgabe (auf den Monat umgelegt)"),
        mk("Müllabfuhr & Abfall", "Betriebskosten", 25.00, "Müllgebühren"),
        mk("Wohngebäudeversicherung", "Betriebskosten", 45.00, "Schutz gegen Feuer, Sturm, Leitungswasser"),
        mk("Hausratversicherung", "Betriebskosten", 15.00, "Schutz für Möbel und bewegliche Gegenstände"),
        mk("Schornsteinfeger & Wartung", "Betriebskosten", 15.00, "Heizungswartung und Schornsteinfeger"),
        mk("Internet / Kabelfernsehen", "Betriebskosten", 40.00, "Glasfaser- oder DSL-Anschluss"),
        mk("GEZ / Rundfunkbeitrag", "Betriebskosten", 18.36, "Gesetzlicher Pflichtbeitrag")
    ];
}

export function loadHouseExpensesFromLocal() {
    const saved = localStorage.getItem('local_house_expenses');
    if (saved) {
        state.houseExpenses = JSON.parse(saved);
    } else {
        state.houseExpenses = getDefaultHouseExpenses();
        localStorage.setItem('local_house_expenses', JSON.stringify(state.houseExpenses));
    }
}

export function saveHouseExpensesToLocal() {
    localStorage.setItem('local_house_expenses', JSON.stringify(state.houseExpenses));
}

// ==================== SZENARIO-HELFER ====================
export function getScenarioValues() {
    const s = state.scenarioSettings || {};
    const p2Income = parseFloat(v(s, 'partner2Income') ?? 2000);
    const useCustomEg = !!v(s, 'useCustomElterngeld');
    const customEg = parseFloat(v(s, 'customElterngeldAmount') ?? 1300);
    const calculatedEg = Math.min(1800, Math.max(300, Math.round(p2Income * 0.65 * 100) / 100));
    return {
        isActive: !!v(s, 'isScenarioModeActive'),
        housingScenario: v(s, 'housingScenario') || 'Rent',
        rentAmount: parseFloat(v(s, 'rentExpenseAmount') ?? 850),
        p1SharePercent: parseFloat(v(s, 'rentPartner1SharePercent') ?? 50),
        isBabyActive: !!v(s, 'isBabyScenarioActive'),
        p1Income: parseFloat(v(s, 'partner1Income') ?? 2800),
        p2Income: p2Income,
        useCustomEg,
        customEg,
        calculatedEg,
        effectiveEg: useCustomEg ? customEg : calculatedEg,
        kindergeld: parseFloat(v(s, 'kindergeldAmount') ?? 250),
        childExpenses: parseFloat(v(s, 'childExpenses') ?? 250)
    };
}

export function getTotalHouseExpenses() {
    return (state.houseExpenses || []).reduce((sum, h) => sum + parseFloat(v(h, 'amount') || 0), 0);
}

// Wohnkosten wie in der Desktop-App: im Haus-Szenario die Hauskosten-Summe, sonst Miete.
export function getHousingTotal() {
    const sc = getScenarioValues();
    return (sc.isActive && sc.housingScenario === 'House') ? getTotalHouseExpenses() : sc.rentAmount;
}

function isRentTitle(title, category) {
    return category === 'Wohnen' && (title || '').toLowerCase().includes('miete');
}

function startDateReached(entry, year, month) {
    const raw = v(entry, 'startDate');
    if (!raw) return true;
    const sd = new Date(raw);
    if (isNaN(sd.getTime())) return true;
    return sd.getFullYear() < year || (sd.getFullYear() === year && (sd.getMonth() + 1) <= month);
}

// ==================== MONATS-BERECHNUNG (Port von GetMonthlyTotals, C#) ====================
// partnerFilter: 'Alle' | 'Partner 1' | 'Partner 2' | 'Beide' (= Gemeinsam)
export function computeMonthlyTotals(year, month, partnerFilter) {
    const sc = getScenarioValues();
    const housingTotal = getHousingTotal();
    const childTotal = (sc.isActive && sc.isBabyActive) ? sc.childExpenses : 0;
    const p2Salary = (sc.isActive && sc.isBabyActive) ? (sc.effectiveEg + sc.kindergeld) : sc.p2Income;
    const p1HousingShare = housingTotal * (sc.p1SharePercent / 100);
    const p2HousingShare = housingTotal * ((100 - sc.p1SharePercent) / 100);

    // 1. Variable Buchungen des Monats
    const varTrans = [];
    (state.transactions || []).forEach(t => {
        if (v(t, 'isDeleted')) return;
        if (v(t, 'isFixedCost')) return;
        const d = new Date(v(t, 'date'));
        if (d.getFullYear() !== year || (d.getMonth() + 1) !== month) return;
        varTrans.push({
            id: v(t, 'id'),
            title: v(t, 'title') || '',
            amount: parseFloat(v(t, 'amount') || 0),
            isIncome: !!v(t, 'isIncome'),
            category: v(t, 'category') || 'Sonstiges',
            assignedTo: v(t, 'assignedTo') || 'Gemeinsam',
            date: d,
            notes: v(t, 'notes') || '',
            kind: 'var'
        });
    });

    // Bezahlte Baukosten des Monats als Ausgaben
    (state.buildingCosts || []).forEach(b => {
        if (!v(b, 'isPaid')) return;
        const pd = v(b, 'paymentDate');
        if (!pd) return;
        const d = new Date(pd);
        if (isNaN(d.getTime()) || d.getFullYear() !== year || (d.getMonth() + 1) !== month) return;
        varTrans.push({
            id: v(b, 'id'),
            title: `Baukosten: ${v(b, 'name') || ''}`,
            amount: parseFloat(v(b, 'amount') || 0),
            isIncome: false,
            category: 'Baukosten',
            assignedTo: v(b, 'paidBy') || 'Gemeinsam',
            date: d,
            notes: '',
            kind: 'baukosten'
        });
    });

    // 2. Fixkosten: gebuchte Transaktionen bevorzugen, sonst dynamisch schätzen
    const savedFixed = (state.transactions || []).filter(t => {
        if (v(t, 'isDeleted')) return false;
        if (!v(t, 'isFixedCost')) return false;
        const d = new Date(v(t, 'date'));
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const hasSavedFixedCosts = savedFixed.length > 0;

    const matchPartner = (assignedTo) => {
        if (partnerFilter === 'Alle') return true;
        if (partnerFilter === 'Beide') return (assignedTo || 'Gemeinsam') === 'Gemeinsam';
        return assignedTo === partnerFilter;
    };

    let fixedInc = 0;
    let fixedExp = 0;
    const fixedIncomeRows = [];

    // Wohn-/Kind-Anteil je Filter
    let housingShare = housingTotal;
    let childShare = childTotal;
    if (partnerFilter === 'Partner 1') { housingShare = p1HousingShare; childShare = childTotal / 2; }
    else if (partnerFilter === 'Partner 2') { housingShare = p2HousingShare; childShare = childTotal / 2; }

    if (hasSavedFixedCosts) {
        savedFixed.forEach(t => {
            const assignedTo = v(t, 'assignedTo') || 'Gemeinsam';
            if (!matchPartner(assignedTo)) return;
            const amount = parseFloat(v(t, 'amount') || 0);
            if (v(t, 'isIncome')) {
                fixedInc += amount;
                fixedIncomeRows.push({
                    title: v(t, 'title') || '',
                    amount,
                    category: v(t, 'category') || 'Sonstiges',
                    assignedTo,
                    date: new Date(v(t, 'date'))
                });
            } else if (!isRentTitle(v(t, 'title'), v(t, 'category'))) {
                fixedExp += amount;
            }
        });
        fixedExp += housingShare + childShare;
    } else {
        // Dynamische Schätzung wie am PC
        const fixedList = state.fixedExpenses || [];

        // Gehälter
        if (partnerFilter === 'Partner 1' || partnerFilter === 'Alle') {
            if (sc.p1Income > 0) {
                fixedInc += sc.p1Income;
                fixedIncomeRows.push({ title: `Gehalt (${state.partner1Name})`, amount: sc.p1Income, category: 'Gehalt', assignedTo: 'Partner 1', date: new Date(year, month - 1, 1) });
            }
        }
        if (partnerFilter === 'Partner 2' || partnerFilter === 'Alle') {
            if (p2Salary > 0) {
                const title = (sc.isActive && sc.isBabyActive) ? `Elterngeld + Kindergeld (${state.partner2Name})` : `Gehalt (${state.partner2Name})`;
                fixedInc += p2Salary;
                fixedIncomeRows.push({ title, amount: p2Salary, category: 'Gehalt', assignedTo: 'Partner 2', date: new Date(year, month - 1, 1) });
            }
        }

        // Fixe Einnahmen (bei P1/P2 ohne Kategorie "Gehalt", wie am PC)
        fixedList.forEach(f => {
            if (!v(f, 'isIncome')) return;
            if (!startDateReached(f, year, month)) return;
            const assignedTo = v(f, 'assignedTo') || 'Gemeinsam';
            if (!matchPartner(assignedTo)) return;
            if ((partnerFilter === 'Partner 1' || partnerFilter === 'Partner 2') && (v(f, 'category') === 'Gehalt')) return;
            const amount = parseFloat(v(f, 'amount') || 0);
            fixedInc += amount;
            const day = Math.min(Math.max(parseInt(v(f, 'dayOfMonth') || 1), 1), 28);
            fixedIncomeRows.push({ title: v(f, 'title') || '', amount, category: v(f, 'category') || 'Sonstiges', assignedTo, date: new Date(year, month - 1, day) });
        });

        // Fixe Ausgaben (ohne Miet-Einträge, mit Startdatum)
        fixedList.forEach(f => {
            if (v(f, 'isIncome')) return;
            if (!startDateReached(f, year, month)) return;
            if (isRentTitle(v(f, 'title'), v(f, 'category'))) return;
            const assignedTo = v(f, 'assignedTo') || 'Gemeinsam';
            if (!matchPartner(assignedTo)) return;
            fixedExp += parseFloat(v(f, 'amount') || 0);
        });

        // Kreditraten
        (state.loans || []).forEach(l => {
            if (v(l, 'includeInFixedCosts') === false) return;
            const assignedTo = v(l, 'assignedTo') || 'Gemeinsam';
            if (!matchPartner(assignedTo)) return;
            fixedExp += parseFloat(v(l, 'monthlyRate') || 0);
        });

        fixedExp += housingShare + childShare;
    }

    // 3. Variable Buchungen nach Partner filtern
    const filteredVar = varTrans.filter(t => matchPartner(t.assignedTo));
    let varInc = 0, varExp = 0;
    filteredVar.forEach(t => {
        if (t.isIncome) varInc += t.amount;
        else varExp += t.amount;
    });

    filteredVar.sort((a, b) => b.date - a.date);

    return {
        income: varInc + fixedInc,
        expenses: varExp + fixedExp,
        varTransactions: filteredVar,
        fixedExpTotal: fixedExp,
        fixedIncomeRows,
        hasSavedFixedCosts
    };
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
