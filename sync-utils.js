export const DRIVE_NAMESPACE_KEY = 'haushaltsbuchNamespace';
export const DRIVE_NAMESPACE = 'desktop-v1';
export const DRIVE_LOGICAL_NAME_KEY = 'logicalName';
export const DRIVE_DOCUMENT_TYPE_KEY = 'documentType';
export const LEGACY_DRIVE_APP_PROPERTY_KEY = 'haushaltsbuchDataType';

const DRIVE_FILE_TYPES = Object.freeze({
    'transactions.json': 'transactions',
    'fixed_expenses.json': 'fixedExpenses',
    'loans.json': 'loans',
    'building_costs.json': 'buildingCosts',
    'house_expenses.json': 'houseExpenses',
    'scenario_settings.json': 'scenarioSettings'
});

export function getDriveFileType(fileName) {
    return DRIVE_FILE_TYPES[fileName] || 'data';
}

export function getDriveAppProperties(fileName, documentType = 'json') {
    return {
        [DRIVE_NAMESPACE_KEY]: DRIVE_NAMESPACE,
        [DRIVE_LOGICAL_NAME_KEY]: String(fileName),
        [DRIVE_DOCUMENT_TYPE_KEY]: documentType
    };
}

export function normalizeStorageContext(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    return encodeURIComponent(normalized).replace(/%/g, '_');
}

export function makeScopedStorageKey(baseKey, accountContext, fileContext = '') {
    const account = normalizeStorageContext(accountContext);
    if (!account) throw new Error('Google-Drive-Kontokontext fehlt.');
    const file = normalizeStorageContext(fileContext);
    return file ? `${baseKey}::${account}::${file}` : `${baseKey}::${account}`;
}

export function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

export function nextPendingRecord(previous, snapshot, now = new Date().toISOString()) {
    const previousRevision = Number(previous && previous.revision) || 0;
    return {
        revision: previousRevision + 1,
        updatedAt: now,
        snapshot: cloneJson(snapshot)
    };
}

export function mergeTransactions(local, remote) {
    const map = new Map();

    function mergeIntoMap(transaction) {
        if (!transaction) return;
        const id = transaction.id || transaction.Id;
        if (!id) return;

        const existing = map.get(id);
        if (!existing) {
            map.set(id, transaction);
            return;
        }

        const incomingTime = new Date(transaction.updatedAt || transaction.UpdatedAt || 0).getTime();
        const existingTime = new Date(existing.updatedAt || existing.UpdatedAt || 0).getTime();
        const incomingDeleted = !!(transaction.isDeleted || transaction.IsDeleted);
        const existingDeleted = !!(existing.isDeleted || existing.IsDeleted);

        if (incomingTime > existingTime || (incomingTime === existingTime && incomingDeleted && !existingDeleted)) {
            map.set(id, transaction);
        }
    }

    if (Array.isArray(local)) local.forEach(mergeIntoMap);
    if (Array.isArray(remote)) remote.forEach(mergeIntoMap);
    return Array.from(map.values());
}

export function isSafeIconGlyph(value) {
    const glyph = String(value || '');
    return glyph.length > 0 && glyph.length <= 24 && !/[<>&"'`=\u0000-\u001f\u007f]/u.test(glyph);
}

export function calculateHousingTotal({ isScenarioActive, housingScenario, rentAmount, houseExpenses }) {
    if (isScenarioActive && housingScenario === 'House') {
        return (Array.isArray(houseExpenses) ? houseExpenses : []).reduce((sum, item) => {
            const rawAmount = item?.amount ?? item?.Amount ?? 0;
            const amount = Number.parseFloat(rawAmount);
            return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);
    }
    const rent = Number.parseFloat(rentAmount);
    return Number.isFinite(rent) ? rent : 0;
}

export function shouldApplySpecialPayment(simulationEnabled, itemEnabled) {
    return simulationEnabled === true && itemEnabled === true;
}
