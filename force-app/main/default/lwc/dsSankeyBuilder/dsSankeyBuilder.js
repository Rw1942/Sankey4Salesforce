/**
 * Story 1.1 — Parent orchestrator for the Sankey Builder.
 * Section 11: Centralized state management — single source of truth.
 * All child components receive slices via @api and communicate up via custom events.
 */
import { LightningElement } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getSankeyData from '@salesforce/apex/SankeyController.getSankeyData';

// Story 8.1: Dataset limit enforced in SOQL
const DATASET_LIMIT = 10000;

export default class DsSankeyBuilder extends NavigationMixin(LightningElement) {

    // Section 11: Single state store
    state = {
        config: {
            objectApiName: '',
            filters: [],
            pathFields: [],
            metricType: 'COUNT',
            metricField: '',
            recordIdField: 'Id',
            nullHandling: 'GROUP_UNKNOWN'
        },
        data: {
            nodes: [],
            links: [],
            records: [],
            stepColumns: [],
            kpis: null,
            topPaths: []
        },
        ui: {
            loading: false,
            mode: 'AGGREGATE',
            metricDisplay: 'count',
            selectedRecord: '',
            selectedNode: null,
            traceStep: 0,
            flowStepIdx: '',
            flowTraceValue: ''
        }
    };

    errorMessage = '';
    showInsights = true;
    dataLoaded = false;
    configStarted = false;
    isTruncated = false;

    // Story 8.2: Client-side cache — hash of last config to avoid redundant Apex calls
    _lastConfigHash = '';
    _cachedResponse = null;

    /* ═══ Computed Properties ═════════════════════════════════════════ */

    // Story 1.2: Show empty state when user hasn't started config
    get showEmptyState() {
        return !this.configStarted && !this.dataLoaded;
    }

    // Story 8.1: Show config panel after Start, before or after data load
    get showConfigPanel() {
        return this.configStarted && !this.state.ui.loading;
    }

    get hasData() {
        return this.dataLoaded && this.state.data.nodes.length > 0;
    }

    get datasetLimit() {
        return DATASET_LIMIT;
    }

    // Story 8.1: Show warning when dataset was truncated
    get showTruncationWarning() {
        return this.isTruncated && this.hasData;
    }

    get chartColumnClass() {
        return this.showInsights
            ? 'slds-col slds-size_1-of-1 slds-large-size_8-of-12'
            : 'slds-col slds-size_1-of-1';
    }

    get insightsColumnClass() {
        return 'slds-col slds-size_1-of-1 slds-large-size_4-of-12';
    }

    // Story 9.1: Config payload for saving
    get configForSave() {
        return JSON.parse(JSON.stringify(this.state.config));
    }

    // Story 6.2: Compute flow trace KPIs client-side (no server roundtrip)
    get flowTraceKpis() {
        if (this.state.ui.mode !== 'FLOW_TRACE' || !this.state.ui.flowTraceValue) {
            return null;
        }
        const stepIdx = parseInt(this.state.ui.flowStepIdx, 10);
        const value = this.state.ui.flowTraceValue;
        const records = this.state.data.records;
        const steps = this.state.data.stepColumns;

        if (isNaN(stepIdx) || stepIdx < 0 || stepIdx >= steps.length) return null;

        const col = steps[stepIdx];
        const matching = records.filter(r => (r[col] || '\u2205') === value);
        const totalRecords = matching.length;
        const totalAmount = matching.reduce((s, r) => s + (r.amount || 0), 0);
        const conversionPct = records.length > 0
            ? ((totalRecords / records.length) * 100).toFixed(1)
            : '0.0';

        return { totalRecords, totalAmount, conversionPct };
    }

    /* ═══ EPIC 1 Handlers ════════════════════════════════════════════ */

    // Story 1.2: Start CTA transitions from empty state to config panel
    handleStart() {
        this.configStarted = true;
    }

    /* ═══ EPIC 2 Handlers ════════════════════════════════════════════ */

    // Story 2.1: Object selected from dsObjectPicker
    handleObjectSelect(event) {
        const objectApiName = event.detail.objectApiName;
        this.state = {
            ...this.state,
            config: {
                ...this.state.config,
                objectApiName,
                filters: [],
                pathFields: [],
                metricField: ''
            }
        };
        this.dataLoaded = false;
        this.errorMessage = '';
    }

    // Story 2.3: Metric type/field changed from dsMetricSelector
    handleMetricChange(event) {
        const { metricType, metricField } = event.detail;
        this.state = {
            ...this.state,
            config: { ...this.state.config, metricType, metricField },
            ui: {
                ...this.state.ui,
                metricDisplay: metricType === 'AMOUNT' ? 'amount' : 'count'
            }
        };
    }

    /* ═══ EPIC 3 Handlers ════════════════════════════════════════════ */

    // Story 3.1/3.2/3.3: Path configuration from dsPathSelector
    handlePathConfigured(event) {
        const { pathFields, nullHandling, recordIdField } = event.detail;
        this.state = {
            ...this.state,
            config: { ...this.state.config, pathFields, nullHandling, recordIdField }
        };
    }

    /* ═══ EPIC 4 Handlers ════════════════════════════════════════════ */

    // Story 2.2 + 4.1 + 8.1: Load data only when user clicks Load Data
    handleLoadData(event) {
        const filters = event.detail.filters;
        this.state = {
            ...this.state,
            config: { ...this.state.config, filters }
        };
        this._fetchSankeyData();
    }

    // Story 8.2: Hash config for caching
    _hashConfig() {
        return JSON.stringify(this.state.config);
    }

    // Story 4.1 + 8.2: Fetch data from Apex with caching
    async _fetchSankeyData() {
        // Story 8.1: Guard — don't query without minimum config
        if (!this.state.config.objectApiName || this.state.config.pathFields.length < 2) {
            this.errorMessage = 'Please select an object and at least 2 path fields before loading data.';
            return;
        }

        // Story 8.2: Skip Apex call if config unchanged
        const configHash = this._hashConfig();
        if (configHash === this._lastConfigHash && this._cachedResponse) {
            this._applyResponse(this._cachedResponse);
            return;
        }

        this.state = { ...this.state, ui: { ...this.state.ui, loading: true } };
        this.errorMessage = '';

        try {
            const configJson = JSON.stringify(this.state.config);
            const responseJson = await getSankeyData({ configJson });
            const response = JSON.parse(responseJson);

            // Story 8.2: Cache the result
            this._lastConfigHash = configHash;
            this._cachedResponse = response;

            this._applyResponse(response);
        } catch (error) {
            // Story 4.1: Error state if no data
            this.errorMessage = error.body ? error.body.message : (error.message || 'An error occurred loading data.');
            this.state = { ...this.state, ui: { ...this.state.ui, loading: false } };
        }
    }

    _applyResponse(response) {
        // Story 8.1: Detect truncation
        this.isTruncated = response.records && response.records.length >= DATASET_LIMIT;
        this.dataLoaded = true;
        this.state = {
            ...this.state,
            data: {
                nodes: response.nodes || [],
                links: response.links || [],
                records: response.records || [],
                stepColumns: response.stepColumns || [],
                kpis: response.kpis || null,
                topPaths: response.topPaths || []
            },
            ui: {
                ...this.state.ui,
                loading: false,
                mode: 'AGGREGATE',
                selectedRecord: '',
                selectedNode: null,
                traceStep: 0,
                flowStepIdx: '',
                flowTraceValue: ''
            }
        };
    }

    /* ═══ EPIC 5/6 Handlers (Trace) ═════════════════════════════════ */

    // Story 5.1/6.1: Mode changed (Aggregate, Record Trace, Flow Trace)
    handleModeChange(event) {
        const mode = event.detail.value;
        const uiUpdate = { ...this.state.ui, mode };
        if (mode !== 'RECORD_TRACE') {
            uiUpdate.selectedRecord = '';
            uiUpdate.traceStep = 0;
        }
        if (mode !== 'FLOW_TRACE') {
            uiUpdate.flowStepIdx = '';
            uiUpdate.flowTraceValue = '';
        }
        this.state = { ...this.state, ui: uiUpdate };
    }

    // Story 5.1: Record selected for tracing
    handleRecordSelect(event) {
        const selectedRecord = event.detail.value;
        const maxTrace = this.state.data.stepColumns.length - 2;
        this.state = {
            ...this.state,
            ui: { ...this.state.ui, selectedRecord, traceStep: Math.max(0, maxTrace) }
        };
    }

    // Story 6.1: Flow step changed
    handleFlowStepChange(event) {
        this.state = {
            ...this.state,
            ui: { ...this.state.ui, flowStepIdx: event.detail.value, flowTraceValue: '' }
        };
    }

    // Story 6.2: Flow value changed
    handleFlowValueChange(event) {
        this.state = {
            ...this.state,
            ui: { ...this.state.ui, flowTraceValue: event.detail.value }
        };
    }

    handleTraceNext() {
        const maxTrace = this.state.data.stepColumns.length - 2;
        if (this.state.ui.traceStep < maxTrace) {
            this.state = {
                ...this.state,
                ui: { ...this.state.ui, traceStep: this.state.ui.traceStep + 1 }
            };
        }
    }

    handleTracePrev() {
        if (this.state.ui.traceStep > 0) {
            this.state = {
                ...this.state,
                ui: { ...this.state.ui, traceStep: this.state.ui.traceStep - 1 }
            };
        }
    }

    handleTraceReset() {
        this.state = { ...this.state, ui: { ...this.state.ui, traceStep: 0 } };
    }

    // Story 5.2: Open record in Salesforce via NavigationMixin
    handleOpenRecord(event) {
        const recordId = event.detail.recordId;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

    // Story 6.2: Node click from chart triggers flow trace
    handleNodeClick(event) {
        const { stepIndex, label } = event.detail;
        this.state = {
            ...this.state,
            ui: {
                ...this.state.ui,
                mode: 'FLOW_TRACE',
                flowStepIdx: String(stepIndex),
                flowTraceValue: label
            }
        };
    }

    /* ═══ EPIC 7 Handlers ════════════════════════════════════════════ */

    handleToggleInsights() {
        this.showInsights = !this.showInsights;
    }

    /* ═══ EPIC 9 Handlers ════════════════════════════════════════════ */

    // Story 9.1: Save acknowledged — no additional action needed here
    handleSaveConfig() {
        // Toast or UI feedback can be added here
    }

    // Story 9.2: Load saved config and re-populate all child components
    handleConfigLoaded(event) {
        const savedConfig = event.detail.config;
        this.state = {
            ...this.state,
            config: { ...this.state.config, ...savedConfig }
        };
        this.configStarted = true;
        // Trigger data reload with the restored config
        this._fetchSankeyData();
    }

    /* ═══ Reset ═══════════════════════════════════════════════════════ */

    handleResetAll() {
        this.state = {
            config: {
                objectApiName: '',
                filters: [],
                pathFields: [],
                metricType: 'COUNT',
                metricField: '',
                recordIdField: 'Id',
                nullHandling: 'GROUP_UNKNOWN'
            },
            data: {
                nodes: [],
                links: [],
                records: [],
                stepColumns: [],
                kpis: null,
                topPaths: []
            },
            ui: {
                loading: false,
                mode: 'AGGREGATE',
                metricDisplay: 'count',
                selectedRecord: '',
                selectedNode: null,
                traceStep: 0,
                flowStepIdx: '',
                flowTraceValue: ''
            }
        };
        this.dataLoaded = false;
        this.configStarted = true;
        this.errorMessage = '';
        this.isTruncated = false;
        this._lastConfigHash = '';
        this._cachedResponse = null;
    }
}
