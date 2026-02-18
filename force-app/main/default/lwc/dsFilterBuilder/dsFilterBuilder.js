/**
 * Story 2.2 — Define the dataset with filters.
 * Builds filter rows (Field, Operator, Value), date range quick filters,
 * preview record count, and a Load Data CTA.
 * Story 8.1: Query runs only after user clicks "Load Data".
 */
import { LightningElement, api, track, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import getRecordCount from '@salesforce/apex/SankeyController.getRecordCount';

let _rowCounter = 0;

export default class DsFilterBuilder extends LightningElement {

    @api objectApiName = '';
    @api filters = [];

    @track filterRows = [];
    @track fieldOptions = [];
    @track selectedDateRange = '';
    @track recordCount = null;
    @track isCountLoading = false;

    // Story 2.2: Operator options for filter rows
    get operatorOptions() {
        return [
            { label: '=',    value: '=' },
            { label: '!=',   value: '!=' },
            { label: '>',    value: '>' },
            { label: '<',    value: '<' },
            { label: '>=',   value: '>=' },
            { label: '<=',   value: '<=' },
            { label: 'LIKE', value: 'LIKE' },
            { label: 'IN',   value: 'IN' }
        ];
    }

    // Story 2.2: Date range quick filter options
    get dateRangeOptions() {
        return [
            { label: 'None',         value: '' },
            { label: 'This Quarter', value: 'THIS_QUARTER' },
            { label: 'Last Quarter', value: 'LAST_QUARTER' },
            { label: 'This Year',    value: 'THIS_YEAR' },
            { label: 'Last Year',    value: 'LAST_YEAR' },
            { label: 'Last 30 Days', value: 'LAST_30_DAYS' },
            { label: 'Last 90 Days', value: 'LAST_90_DAYS' }
        ];
    }

    get previewLabel() {
        return this.isCountLoading ? 'Counting...' : 'Preview Count';
    }

    get isPreviewDisabled() {
        return this.isCountLoading || !this.objectApiName;
    }

    get isLoadDisabled() {
        return !this.objectApiName;
    }

    // Story 2.2: Wire getObjectInfo to populate field options for filters
    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            const fields = data.fields;
            this.fieldOptions = Object.keys(fields)
                .map(key => ({
                    label: fields[key].label + ' (' + key + ')',
                    value: key
                }))
                .sort((a, b) => a.label.localeCompare(b.label));
        } else if (error) {
            this.fieldOptions = [];
        }
    }

    handleAddRow() {
        _rowCounter++;
        this.filterRows = [
            ...this.filterRows,
            { id: 'row-' + _rowCounter, field: '', operator: '=', value: '' }
        ];
    }

    handleRemoveRow(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.filter(r => r.id !== rowId);
    }

    handleFieldChange(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.map(r =>
            r.id === rowId ? { ...r, field: event.detail.value } : r
        );
    }

    handleOperatorChange(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.map(r =>
            r.id === rowId ? { ...r, operator: event.detail.value } : r
        );
    }

    handleValueChange(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.map(r =>
            r.id === rowId ? { ...r, value: event.target.value } : r
        );
    }

    handleDateRangeChange(event) {
        this.selectedDateRange = event.detail.value;
    }

    _buildFilters() {
        const filters = this.filterRows
            .filter(r => r.field && r.operator && r.value)
            .map(r => ({ field: r.field, operator: r.operator, value: r.value }));

        if (this.selectedDateRange) {
            filters.push({
                field: 'CreatedDate',
                operator: '=',
                value: this.selectedDateRange,
                isDateLiteral: true
            });
        }
        return filters;
    }

    // Story 2.2: Preview record count — separate Apex call
    async handlePreviewCount() {
        this.isCountLoading = true;
        this.recordCount = null;
        try {
            const configJson = JSON.stringify({
                objectApiName: this.objectApiName,
                filters: this._buildFilters()
            });
            const count = await getRecordCount({ configJson });
            this.recordCount = count;
        } catch (err) {
            this.recordCount = 'Error: ' + (err.body ? err.body.message : err.message);
        } finally {
            this.isCountLoading = false;
        }
    }

    // Story 2.2 + 8.1: Fire loaddata event — query runs only when user clicks
    handleLoadData() {
        const filters = this._buildFilters();
        this.dispatchEvent(new CustomEvent('loaddata', {
            detail: { filters }
        }));
    }
}
