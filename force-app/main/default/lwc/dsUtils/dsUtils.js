/**
 * Shared pure utilities for the Sankey Builder component suite.
 * No LightningElement — just named exports for cross-component reuse.
 */

/* ═══ Config defaults & normalization ═════════════════════════════════ */

const DEFAULT_CONFIG = {
    objectApiName: '',
    filters: [],
    pathFields: [],
    metricType: 'COUNT',
    metricField: '',
    recordIdField: 'Id',
    nullHandling: 'GROUP_UNKNOWN'
};

const DEFAULT_DATA = {
    nodes: [],
    links: [],
    records: [],
    stepColumns: [],
    kpis: null,
    topPaths: []
};

const DEFAULT_UI = {
    loading: false,
    mode: 'AGGREGATE',
    metricDisplay: 'count',
    selectedRecord: '',
    traceStep: 0,
    flowStepIdx: '',
    flowTraceValue: '',
    flowFocusChain: []
};

export function defaultConfig() {
    return { ...DEFAULT_CONFIG, filters: [], pathFields: [] };
}

export function defaultData() {
    return { ...DEFAULT_DATA, nodes: [], links: [], records: [], stepColumns: [], topPaths: [] };
}

export function defaultUi() {
    return { ...DEFAULT_UI, flowFocusChain: [] };
}

export function normalizeLoadedConfig(raw) {
    return {
        objectApiName: raw.objectApiName || DEFAULT_CONFIG.objectApiName,
        filters: raw.filters || [],
        pathFields: raw.pathFields || [],
        metricType: raw.metricType || DEFAULT_CONFIG.metricType,
        metricField: raw.metricField || DEFAULT_CONFIG.metricField,
        recordIdField: raw.recordIdField || DEFAULT_CONFIG.recordIdField,
        nullHandling: raw.nullHandling || DEFAULT_CONFIG.nullHandling
    };
}

export function buildSavePayload(name, config) {
    return {
        name,
        objectApiName: config.objectApiName,
        filters: config.filters,
        pathFields: config.pathFields,
        metricType: config.metricType,
        metricField: config.metricField,
        recordIdField: config.recordIdField,
        nullHandling: config.nullHandling
    };
}

/* ═══ Field metadata helpers ══════════════════════════════════════════ */

const TYPE_PRIORITY = {
    Picklist: 0,
    String: 1, Phone: 1, Email: 1, Url: 1,
    Currency: 2, Double: 2, Int: 2, Long: 2, Percent: 2
};

export function fieldLabel(fieldMeta, apiName) {
    return fieldMeta.label + ' (' + apiName + ')';
}

export function sortFieldKeysByType(fieldKeys, fieldsMap) {
    return [...fieldKeys].sort((a, b) => {
        const pa = TYPE_PRIORITY[fieldsMap[a].dataType] ?? 3;
        const pb = TYPE_PRIORITY[fieldsMap[b].dataType] ?? 3;
        return pa !== pb ? pa - pb : fieldsMap[a].label.localeCompare(fieldsMap[b].label);
    });
}

export function buildFieldOptions(fieldKeys, fieldsMap) {
    return sortFieldKeysByType(fieldKeys, fieldsMap).map(key => ({
        label: fieldLabel(fieldsMap[key], key),
        value: key
    }));
}

/* ═══ Number formatting ═══════════════════════════════════════════════ */

export function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits,
        minimumFractionDigits: 0
    }).format(value || 0);
}

export function formatPercent(value) {
    return formatNumber(Number(value || 0), 1) + '%';
}
