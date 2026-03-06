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

    get insightContext() {
        if (!this.hasData) {
            return null;
        }

        if (this.state.ui.mode === 'RECORD_TRACE' && this.state.ui.selectedRecord) {
            return this._buildRecordInsightContext();
        }

        if (this.state.ui.mode === 'FLOW_TRACE' && this.state.ui.flowTraceValue) {
            return this._buildFlowInsightContext();
        }

        return this._buildOverviewInsightContext();
    }

    _buildOverviewInsightContext() {
        const totalRecords = this.state.data.records.length;
        const coverage = this._computeStepCoverage(this.state.data.records);
        const largestDrop = this._largestDrop(coverage);
        const topPaths = this._decoratePaths(this.state.data.topPaths, totalRecords);
        const cards = [
            {
                id: 'records',
                label: 'Records analyzed',
                value: this._formatNumber(totalRecords)
            },
            {
                id: 'steps',
                label: 'Flow steps',
                value: this._formatNumber(this.state.data.stepColumns.length)
            },
            {
                id: 'completion',
                label: 'Reached last step',
                value: this._formatPercent(this.state.data.kpis ? this.state.data.kpis.conversionRate : 0),
                detail: coverage.length ? coverage[coverage.length - 1].label : ''
            }
        ];

        if (this.state.config.metricType === 'AMOUNT') {
            cards.push({
                id: 'metricTotal',
                label: 'Total ' + this._metricLabel(),
                value: this._formatNumber(this.state.data.kpis ? this.state.data.kpis.totalAmount : 0, 1)
            });
        } else {
            cards.push({
                id: 'largestDrop',
                label: 'Largest step loss',
                value: largestDrop ? largestDrop.pctLabel : '0%'
            });
        }

        const standout = [];
        if (topPaths.length > 0) {
            standout.push({
                id: 'commonPath',
                title: 'Most common journey',
                detail: topPaths[0].path + ' · ' + topPaths[0].metricLabel + ' · ' + topPaths[0].shareLabel
            });
        }
        if (largestDrop) {
            standout.push({
                id: 'largestDrop',
                title: 'Biggest step loss',
                detail: largestDrop.fromLabel + ' to ' + largestDrop.toLabel + ' loses ' + largestDrop.countLabel + ' (' + largestDrop.pctLabel + ')'
            });
        }

        const summary = topPaths.length > 0
            ? 'Most records follow "' + topPaths[0].path + '", while only ' +
                this._formatPercent(this.state.data.kpis ? this.state.data.kpis.conversionRate : 0) +
                ' reach the final step.'
            : 'This view summarizes how records move across the selected steps.';

        return {
            modeLabel: 'Overview',
            title: 'At a glance',
            summary,
            pills: this._buildCommonPills(),
            cards,
            standout,
            pathSectionTitle: 'Common journeys',
            pathRows: topPaths,
            storySteps: [],
            nextSteps: this._buildOverviewNextSteps(topPaths, largestDrop),
            warnings: this._buildWarnings(),
            showClearFocus: false
        };
    }

    _buildFlowInsightContext() {
        const stepIdx = parseInt(this.state.ui.flowStepIdx, 10);
        const stepApi = this.state.data.stepColumns[stepIdx];
        const stepLabel = this.stepLabels[stepIdx] || stepApi || 'Selected step';
        const selectedValue = this.state.ui.flowTraceValue;
        const matching = this._matchingFlowRecords();
        const totalRecords = this.state.data.records.length;
        const sharePct = totalRecords > 0 ? (matching.length / totalRecords) * 100 : 0;
        const reachedLastStepPct = this._computeReachedLastStepPct(matching);
        const topNext = this._topNeighbor(matching, stepIdx + 1);
        const topPrev = this._topNeighbor(matching, stepIdx - 1);
        const cohortPaths = this._buildTopPathsFromRecords(matching);
        const cards = [
            {
                id: 'cohortSize',
                label: 'Records in focus',
                value: this._formatNumber(matching.length)
            },
            {
                id: 'shareOfTotal',
                label: 'Share of total',
                value: this._formatPercent(sharePct)
            },
            {
                id: 'reachedLastStep',
                label: 'Reached last step',
                value: this._formatPercent(reachedLastStepPct)
            }
        ];

        if (this.state.config.metricType === 'AMOUNT') {
            cards.push({
                id: 'cohortMetricTotal',
                label: 'Total ' + this._metricLabel(),
                value: this._formatNumber(this._sumAmount(matching), 1)
            });
        }

        const standout = [];
        if (topPrev) {
            standout.push({
                id: 'topPrev',
                title: 'Most common source',
                detail: topPrev.stepLabel + ': ' + topPrev.value + ' · ' + this._formatPercent(topPrev.sharePct) + ' of this cohort'
            });
        }
        if (topNext) {
            standout.push({
                id: 'topNext',
                title: 'Most common next stop',
                detail: topNext.stepLabel + ': ' + topNext.value + ' · ' + this._formatPercent(topNext.sharePct) + ' of this cohort'
            });
        }

        return {
            modeLabel: 'Focused Cohort',
            title: stepLabel + ': ' + selectedValue,
            summary: 'You are looking at the records that pass through "' + selectedValue + '" at the "' + stepLabel + '" step.',
            pills: this._buildCommonPills().concat([
                stepLabel,
                selectedValue
            ]),
            cards,
            standout,
            pathSectionTitle: 'Most common journeys in this cohort',
            pathRows: cohortPaths,
            storySteps: [],
            nextSteps: [
                'Click a downstream node to keep narrowing this group.',
                'Switch to Record Trace if you want to inspect one record in detail.',
                'Return to Overview to compare this cohort against the full diagram.'
            ],
            warnings: this._buildWarnings(),
            showClearFocus: true
        };
    }

    _buildRecordInsightContext() {
        const record = this.state.data.records.find(r => r.id === this.state.ui.selectedRecord);
        if (!record) {
            return this._buildOverviewInsightContext();
        }

        const storySteps = this.state.data.stepColumns
            .map((stepApi, index) => {
                const value = record[stepApi];
                if (value === undefined || value === null || value === '') {
                    return null;
                }
                return {
                    id: stepApi,
                    label: this.stepLabels[index] || stepApi,
                    value
                };
            })
            .filter(step => step);

        const fullPath = storySteps.map(step => step.value).join(' -> ');
        const topPathMatch = this.state.data.topPaths.find(path => path.path === fullPath);
        const cards = [
            {
                id: 'storyLength',
                label: 'Steps mapped',
                value: this._formatNumber(storySteps.length)
            },
            {
                id: 'traceProgress',
                label: 'Trace progress',
                value: this._formatTraceProgress()
            }
        ];

        if (this.state.config.metricType === 'AMOUNT') {
            cards.push({
                id: 'recordMetric',
                label: this._metricLabel(),
                value: this._formatNumber(record.amount || 0, 1)
            });
        }

        if (topPathMatch) {
            cards.push({
                id: 'pathRank',
                label: 'Journey rank',
                value: '#' + topPathMatch.rank
            });
        }

        const standout = [
            {
                id: 'recordPath',
                title: 'Record journey',
                detail: fullPath || 'This record does not have a complete path yet.'
            }
        ];
        if (topPathMatch) {
            standout.push({
                id: 'commonJourney',
                title: 'How common this is',
                detail: 'This exact journey is the #' + topPathMatch.rank + ' ranked path in the current dataset.'
            });
        } else {
            standout.push({
                id: 'rareJourney',
                title: 'How common this is',
                detail: 'This exact journey is not in the current top ranked paths.'
            });
        }

        return {
            modeLabel: 'Record Story',
            title: record.name || record.id,
            summary: 'This view follows one record through the flow so you can compare its path with the broader pattern.',
            pills: this._buildCommonPills().concat([
                'Record Trace'
            ]),
            cards,
            standout,
            pathSectionTitle: '',
            pathRows: [],
            storySteps,
            nextSteps: [
                'Use Next and Prev above the chart to animate this record through each transition.',
                'Switch back to Overview to compare this journey with the most common paths.'
            ],
            warnings: this._buildWarnings(),
            showClearFocus: true
        };
    }

    _buildCommonPills() {
        const pills = [];
        pills.push(this._objectLabel || this.state.config.objectApiName || 'Object');
        pills.push(this.state.config.metricType === 'AMOUNT' ? 'Sum of ' + this._metricLabel() : 'Count lens');
        pills.push(this.state.config.filters.length > 0 ? this.state.config.filters.length + ' filters' : 'No filters');
        return pills;
    }

    _buildOverviewNextSteps(topPaths, largestDrop) {
        const nextSteps = [];
        if (topPaths.length > 0) {
            nextSteps.push('Click a thick node in the chart to focus on one cohort and see where it goes next.');
        }
        if (largestDrop) {
            nextSteps.push('Inspect the jump from ' + largestDrop.fromLabel + ' to ' + largestDrop.toLabel + ' to understand where records thin out.');
        }
        nextSteps.push('Switch to Record Trace when you want to walk through a single record step by step.');
        return nextSteps;
    }

    _buildWarnings() {
        const warnings = [];
        if (this.isTruncated) {
            warnings.push('Results were limited to ' + DATASET_LIMIT + ' records. Apply filters if you need a tighter cohort.');
        }
        if (this.state.config.nullHandling === 'GROUP_UNKNOWN') {
            warnings.push('Blank values are grouped as Unknown, which can make some branches look larger.');
        }
        if (this.state.config.nullHandling === 'CARRY_FORWARD') {
            warnings.push('Blank values carry forward from the previous step, which smooths the path but can hide gaps.');
        }
        return warnings;
    }

    _metricLabel() {
        if (this.state.config.metricType !== 'AMOUNT') {
            return 'Records';
        }
        const apiName = this.state.config.metricField;
        return this._fieldLabelMap[apiName] || apiName || 'selected metric';
    }

    _matchingFlowRecords() {
        const stepIdx = parseInt(this.state.ui.flowStepIdx, 10);
        const stepApi = this.state.data.stepColumns[stepIdx];
        if (isNaN(stepIdx) || !stepApi) {
            return [];
        }
        return this.state.data.records.filter(record => (record[stepApi] || '\u2205') === this.state.ui.flowTraceValue);
    }

    _buildTopPathsFromRecords(records) {
        const counts = new Map();
        const amounts = new Map();
        records.forEach(record => {
            const path = this._recordPath(record);
            if (!path) {
                return;
            }
            counts.set(path, (counts.get(path) || 0) + 1);
            amounts.set(path, (amounts.get(path) || 0) + (record.amount || 0));
        });

        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([path, count], index) => ({
                id: 'cohort-path-' + index,
                rank: index + 1,
                path,
                metricLabel: this.state.config.metricType === 'AMOUNT'
                    ? 'Total ' + this._metricLabel() + ': ' + this._formatNumber(amounts.get(path) || 0, 1)
                    : count + ' records',
                shareLabel: this._formatPercent(records.length > 0 ? (count / records.length) * 100 : 0)
            }));
    }

    _decoratePaths(paths, totalRecords) {
        return (paths || []).map(path => {
            const sharePct = totalRecords > 0 ? (path.count / totalRecords) * 100 : 0;
            const metricLabel = this.state.config.metricType === 'AMOUNT'
                ? 'Total ' + this._metricLabel() + ': ' + this._formatNumber(path.amount || 0, 1)
                : path.count + ' records';
            return {
                id: 'path-' + path.rank,
                rank: path.rank,
                path: path.path,
                metricLabel,
                shareLabel: this._formatPercent(sharePct)
            };
        });
    }

    _computeStepCoverage(records) {
        return this.state.data.stepColumns.map((stepApi, index) => {
            const count = records.filter(record =>
                record[stepApi] !== undefined && record[stepApi] !== null && record[stepApi] !== ''
            ).length;
            const sharePct = records.length > 0 ? (count / records.length) * 100 : 0;
            return {
                index,
                label: this.stepLabels[index] || stepApi,
                count,
                sharePct
            };
        });
    }

    _largestDrop(coverage) {
        let largestDrop = null;
        for (let index = 1; index < coverage.length; index++) {
            const prev = coverage[index - 1];
            const current = coverage[index];
            const diff = prev.count - current.count;
            if (diff > 0 && (!largestDrop || diff > largestDrop.count)) {
                largestDrop = {
                    count: diff,
                    countLabel: this._formatNumber(diff) + ' records',
                    pctLabel: this._formatPercent(prev.count > 0 ? (diff / prev.count) * 100 : 0),
                    fromLabel: prev.label,
                    toLabel: current.label
                };
            }
        }
        return largestDrop;
    }

    _computeReachedLastStepPct(records) {
        if (records.length === 0 || this.state.data.stepColumns.length === 0) {
            return 0;
        }
        const lastStep = this.state.data.stepColumns[this.state.data.stepColumns.length - 1];
        const reached = records.filter(record =>
            record[lastStep] !== undefined && record[lastStep] !== null && record[lastStep] !== ''
        ).length;
        return (reached / records.length) * 100;
    }

    _topNeighbor(records, stepIdx) {
        if (stepIdx < 0 || stepIdx >= this.state.data.stepColumns.length || records.length === 0) {
            return null;
        }
        const stepApi = this.state.data.stepColumns[stepIdx];
        const counts = new Map();
        records.forEach(record => {
            const value = record[stepApi];
            if (value === undefined || value === null || value === '') {
                return;
            }
            counts.set(value, (counts.get(value) || 0) + 1);
        });
        if (counts.size === 0) {
            return null;
        }
        const topEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
            stepLabel: this.stepLabels[stepIdx] || stepApi,
            value: topEntry[0],
            sharePct: (topEntry[1] / records.length) * 100
        };
    }

    _recordPath(record) {
        return this.state.data.stepColumns
            .map(stepApi => record[stepApi])
            .filter(value => value !== undefined && value !== null && value !== '')
            .join(' -> ');
    }

    _sumAmount(records) {
        return records.reduce((sum, record) => sum + (record.amount || 0), 0);
    }

    _formatTraceProgress() {
        const totalSteps = Math.max(0, this.state.data.stepColumns.length - 1);
        const currentStep = totalSteps > 0 ? this.state.ui.traceStep + 1 : 0;
        return 'Step ' + currentStep + ' of ' + totalSteps;
    }

    _formatNumber(value, maximumFractionDigits = 0) {
        return new Intl.NumberFormat(undefined, {
            maximumFractionDigits,
            minimumFractionDigits: 0
        }).format(value || 0);
    }

    _formatPercent(value) {
        const numeric = Number(value || 0);
        return this._formatNumber(numeric, 1) + '%';
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

    handleClearInsightFocus() {
        this.state = {
            ...this.state,
            ui: {
                ...this.state.ui,
                mode: 'AGGREGATE',
                selectedRecord: '',
                traceStep: 0,
                flowStepIdx: '',
                flowTraceValue: ''
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
        this.configExpanded = true;
        this._pathUserConfirmed = false;
        this.errorMessage = '';
        this.isTruncated = false;
        this._lastConfigHash = '';
        this._cachedResponse = null;
    }
}
