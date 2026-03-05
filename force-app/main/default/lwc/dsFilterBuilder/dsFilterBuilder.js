/**
 * Filter builder for defining dataset criteria.
 * Builds filter rows (Field, Operator, Value), date range quick filters,
 * and preview record count. Fires filterchange on every edit so the parent
 * always has the latest filters.
 */
import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import getRecordCount from '@salesforce/apex/SankeyController.getRecordCount';

const TYPE_PRIORITY = {
    Picklist: 0,
    String: 1, Phone: 1, Email: 1, Url: 1,
    Currency: 2, Double: 2, Int: 2, Long: 2, Percent: 2
};

export default class DsFilterBuilder extends LightningElement {

    @api objectApiName = '';
    @api filters = [];

    _rowCounter = 0;

    filterRows = [];
    fieldOptions = [];
    selectedDateRange = '';
    recordCount = null;
    isCountLoading = false;

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

    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            const fields = data.fields;
            this.fieldOptions = Object.keys(fields)
                .sort((a, b) => {
                    const pa = TYPE_PRIORITY[fields[a].dataType] ?? 3;
                    const pb = TYPE_PRIORITY[fields[b].dataType] ?? 3;
                    return pa !== pb ? pa - pb : fields[a].label.localeCompare(fields[b].label);
                })
                .map(key => ({
                    label: fields[key].label + ' (' + key + ')',
                    value: key
                }));
        } else if (error) {
            this.fieldOptions = [];
        }
    }

    handleAddRow() {
        this._rowCounter++;
        this.filterRows = [
            ...this.filterRows,
            { id: 'row-' + this._rowCounter, field: '', operator: '=', value: '' }
        ];
    }

    handleRemoveRow(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.filter(r => r.id !== rowId);
        this._fireFilterChange();
    }

    handleFieldChange(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.map(r =>
            r.id === rowId ? { ...r, field: event.detail.value } : r
        );
        this._fireFilterChange();
    }

    handleOperatorChange(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.map(r =>
            r.id === rowId ? { ...r, operator: event.detail.value } : r
        );
        this._fireFilterChange();
    }

    handleValueChange(event) {
        const rowId = event.currentTarget.dataset.rowId;
        this.filterRows = this.filterRows.map(r =>
            r.id === rowId ? { ...r, value: event.target.value } : r
        );
        this._fireFilterChange();
    }

    handleDateRangeChange(event) {
        this.selectedDateRange = event.detail.value;
        this._fireFilterChange();
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

    _fireFilterChange() {
        this.dispatchEvent(new CustomEvent('filterchange', {
            detail: { filters: this._buildFilters() }
        }));
    }
}
