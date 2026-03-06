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
import { defaultConfig, defaultData, defaultUi } from 'c/dsUtils';
import {
    buildOverviewInsight,
    buildFlowInsight,
    buildRecordInsight,
    matchingFlowRecords
} from './insightHelpers';

const DATASET_LIMIT = 10000;

export default class DsSankeyBuilder extends NavigationMixin(LightningElement) {

    state = {
        config: defaultConfig(),
        data: defaultData(),
        ui: defaultUi()
    };

    errorMessage = '';
    showInsights = true;
    dataLoaded = false;
    configStarted = false;
    configExpanded = true;
    isTruncated = false;
    _pathUserConfirmed = false;
    _lastConfigHash = '';
    _cachedResponse = null;
    _fieldLabelMap = {};
    _objectLabel = '';

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
            this._objectLabel = data.label;
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
        return this.configStarted;
    }

    get showChartPlaceholder() {
        return this.configStarted && !this.dataLoaded && !this.state.ui.loading;
    }

    get configToggleIcon() {
        return this.configExpanded ? 'utility:chevrondown' : 'utility:chevronright';
    }

    get configCollapsedHint() {
        return !this.configExpanded;
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
        if (this.dataLoaded) return 'generate';
        if (this._pathUserConfirmed && this.state.config.pathFields.length >= 2) return 'filters';
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

    get isGenerateDisabled() {
        return !this.state.config.objectApiName ||
               this.state.config.pathFields.length < 2 ||
               this.state.ui.loading;
    }

    get flowTraceKpis() {
        if (this.state.ui.mode !== 'FLOW_TRACE' || !this.state.ui.flowTraceValue) {
            return null;
        }
        const matching = matchingFlowRecords(this.state);
        const totalRecords = matching.length;
        const totalAmount = matching.reduce((s, r) => s + (r.amount || 0), 0);
        const allRecords = this.state.data.records.length;
        const conversionPct = allRecords > 0
            ? ((totalRecords / allRecords) * 100).toFixed(1)
            : '0.0';

        return { totalRecords, totalAmount, conversionPct };
    }

    get insightContext() {
        if (!this.hasData) return null;

        if (this.state.ui.mode === 'RECORD_TRACE' && this.state.ui.selectedRecord) {
            return buildRecordInsight(this.state, this.stepLabels, this._fieldLabelMap, this._objectLabel, this.isTruncated);
        }
        if (this.state.ui.mode === 'FLOW_TRACE' && this.state.ui.flowTraceValue) {
            return buildFlowInsight(this.state, this.stepLabels, this._fieldLabelMap, this._objectLabel, this.isTruncated);
        }
        return buildOverviewInsight(this.state, this.stepLabels, this._fieldLabelMap, this._objectLabel, this.isTruncated);
    }

    /* ═══ Handlers ════════════════════════════════════════════════════ */

    handleStart() {
        this.configStarted = true;
        this.configExpanded = true;
    }

    handleToggleConfig() {
        this.configExpanded = !this.configExpanded;
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
        this._pathUserConfirmed = false;
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
        const { pathFields, nullHandling, recordIdField, autoSelected } = event.detail;
        if (!autoSelected) {
            this._pathUserConfirmed = true;
        }
        this.state = {
            ...this.state,
            config: { ...this.state.config, pathFields, nullHandling, recordIdField }
        };
    }

    handleFilterChange(event) {
        const filters = event.detail.filters;
        this.state = {
            ...this.state,
            config: { ...this.state.config, filters }
        };
    }

    handleGenerateDiagram() {
        this._fetchSankeyData();
    }

    _hashConfig() {
        return JSON.stringify(this.state.config);
    }

    async _fetchSankeyData() {
        if (!this.state.config.objectApiName || this.state.config.pathFields.length < 2) {
            this.errorMessage = 'Please choose a data source and at least 2 flow steps before generating.';
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
                title: 'Diagram Ready',
                message: 'Sankey diagram built from ' + recordCount + ' records.',
                variant: 'success'
            }));
        } catch (error) {
            this.errorMessage = error.body ? error.body.message : (error.message || 'Something went wrong generating the diagram.');
            this.state = { ...this.state, ui: { ...this.state.ui, loading: false } };
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error Generating Diagram',
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
                ...defaultUi(),
                metricDisplay: this.state.config.metricType === 'AMOUNT' ? 'amount' : 'count'
            }
        };

        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            const el = this.template.querySelector('[data-id="chart-area"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
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
            uiUpdate.flowFocusChain = [];
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
            ui: { ...this.state.ui, flowStepIdx: event.detail.value, flowTraceValue: '', flowFocusChain: [] }
        };
    }

    handleFlowValueChange(event) {
        const label = event.detail.value;
        const stepIdx = parseInt(this.state.ui.flowStepIdx, 10);
        this.state = {
            ...this.state,
            ui: {
                ...this.state.ui,
                flowTraceValue: label,
                flowFocusChain: label ? [{ stepIndex: stepIdx, label }] : []
            }
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
        const chain = this.state.ui.flowFocusChain || [];
        let newChain;

        if (this.state.ui.mode === 'FLOW_TRACE' && chain.length > 0) {
            const tailStep = chain[chain.length - 1].stepIndex;
            if (stepIndex > tailStep) {
                newChain = [...chain, { stepIndex, label }];
            } else {
                newChain = [{ stepIndex, label }];
            }
        } else {
            newChain = [{ stepIndex, label }];
        }

        this.state = {
            ...this.state,
            ui: {
                ...this.state.ui,
                mode: 'FLOW_TRACE',
                flowStepIdx: String(stepIndex),
                flowTraceValue: label,
                flowFocusChain: newChain
            }
        };
    }

    /* ═══ Insights ════════════════════════════════════════════════════ */

    handleToggleInsights() {
        this.showInsights = !this.showInsights;
    }

    handleClearInsightFocus() {
        this.state = {
            ...this.state,
            ui: {
                ...this.state.ui,
                mode: 'AGGREGATE',
                selectedRecord: '',
                traceStep: 0,
                flowStepIdx: '',
                flowTraceValue: '',
                flowFocusChain: []
            }
        };
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
        this.configExpanded = true;
        this._pathUserConfirmed = true;
        this._fetchSankeyData();
    }

    /* ═══ Reset ═══════════════════════════════════════════════════════ */

    handleResetAll() {
        this.state = {
            config: defaultConfig(),
            data: defaultData(),
            ui: defaultUi()
        };
        this.dataLoaded = false;
        this.configStarted = true;
        this.configExpanded = true;
        this._pathUserConfirmed = false;
        this.errorMessage = '';
        this.isTruncated = false;
        this._lastConfigHash = '';
        this._cachedResponse = null;
    }
}
