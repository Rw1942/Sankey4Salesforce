/**
 * Parent orchestrator for the Sankey Builder.
 * Centralized state management — single source of truth.
 * All child components receive slices via @api and communicate up via custom events.
 */
import { LightningElement, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import getSankeyData from '@salesforce/apex/SankeyController.getSankeyData';

const DATASET_LIMIT = 10000;

export default class DsSankeyBuilder extends NavigationMixin(LightningElement) {

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
    _lastConfigHash = '';
    _cachedResponse = null;
    _fieldLabelMap = {};

    get _wiredObjectApiName() {
        return this.state.config.objectApiName || undefined;
    }

    @wire(getObjectInfo, { objectApiName: '$_wiredObjectApiName' })
    _wiredFieldInfo({ data }) {
        if (data) {
            const map = {};
            const fields = data.fields;
            Object.keys(fields).forEach(key => { map[key] = fields[key].label; });
            this._fieldLabelMap = map;
        }
    }

    get stepLabels() {
        return this.state.data.stepColumns.map(
            api => this._fieldLabelMap[api] || api
        );
    }

    /* ═══ Computed Properties ═════════════════════════════════════════ */

    get showEmptyState() {
        return !this.configStarted && !this.dataLoaded;
    }

    get showConfigPanel() {
        return this.configStarted && !this.state.ui.loading;
    }

    get hasData() {
        return this.dataLoaded && this.state.data.nodes.length > 0;
    }

    get datasetLimit() {
        return DATASET_LIMIT;
    }

    get showTruncationWarning() {
        return this.isTruncated && this.hasData;
    }

    get currentStep() {
        if (this.dataLoaded) return 'load';
        if (this.state.config.pathFields.length >= 2) return 'filters';
        if (this.state.config.objectApiName && this.state.config.metricType) return 'path';
        if (this.state.config.objectApiName) return 'metric';
        return 'object';
    }

    get hideInsights() {
        return !this.showInsights;
    }

    get chartColumnClass() {
        return this.showInsights
            ? 'slds-col slds-size_1-of-1 slds-large-size_8-of-12'
            : 'slds-col slds-size_1-of-1';
    }

    get insightsColumnClass() {
        return 'slds-col slds-size_1-of-1 slds-large-size_4-of-12';
    }

    get configForSave() {
        return JSON.parse(JSON.stringify(this.state.config));
    }

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

    /* ═══ Handlers ════════════════════════════════════════════════════ */

    handleStart() {
        this.configStarted = true;
    }

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

    handlePathConfigured(event) {
        const { pathFields, nullHandling, recordIdField } = event.detail;
        this.state = {
            ...this.state,
            config: { ...this.state.config, pathFields, nullHandling, recordIdField }
        };
    }

    handleLoadData(event) {
        const filters = event.detail.filters;
        this.state = {
            ...this.state,
            config: { ...this.state.config, filters }
        };
        this._fetchSankeyData();
    }

    _hashConfig() {
        return JSON.stringify(this.state.config);
    }

    async _fetchSankeyData() {
        if (!this.state.config.objectApiName || this.state.config.pathFields.length < 2) {
            this.errorMessage = 'Please select an object and at least 2 path fields before loading data.';
            return;
        }

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

            this._lastConfigHash = configHash;
            this._cachedResponse = response;

            this._applyResponse(response);

            const recordCount = response.records ? response.records.length : 0;
            this.dispatchEvent(new ShowToastEvent({
                title: 'Data Loaded',
                message: recordCount + ' records loaded successfully.',
                variant: 'success'
            }));
        } catch (error) {
            this.errorMessage = error.body ? error.body.message : (error.message || 'An error occurred loading data.');
            this.state = { ...this.state, ui: { ...this.state.ui, loading: false } };
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error Loading Data',
                message: this.errorMessage,
                variant: 'error'
            }));
        }
    }

    _applyResponse(response) {
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

    /* ═══ Trace Handlers ═════════════════════════════════════════════ */

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

    handleRecordSelect(event) {
        const selectedRecord = event.detail.value;
        const maxTrace = this.state.data.stepColumns.length - 2;
        this.state = {
            ...this.state,
            ui: { ...this.state.ui, selectedRecord, traceStep: Math.max(0, maxTrace) }
        };
    }

    handleFlowStepChange(event) {
        this.state = {
            ...this.state,
            ui: { ...this.state.ui, flowStepIdx: event.detail.value, flowTraceValue: '' }
        };
    }

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

    handleOpenRecord(event) {
        const recordId = event.detail.recordId;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: { recordId, actionName: 'view' }
        });
    }

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

    /* ═══ Insights ════════════════════════════════════════════════════ */

    handleToggleInsights() {
        this.showInsights = !this.showInsights;
    }

    /* ═══ Save / Load ═════════════════════════════════════════════════ */

    handleSaveConfig() {
        this.dispatchEvent(new ShowToastEvent({
            title: 'Configuration Saved',
            message: 'Your Sankey configuration has been saved.',
            variant: 'success'
        }));
    }

    handleSaveError(event) {
        this.dispatchEvent(new ShowToastEvent({
            title: 'Save Failed',
            message: event.detail.message || 'An error occurred saving the configuration.',
            variant: 'error'
        }));
    }

    handleConfigLoaded(event) {
        const savedConfig = event.detail.config;
        this.state = {
            ...this.state,
            config: { ...this.state.config, ...savedConfig }
        };
        this.configStarted = true;
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
