/**
 * Metric selector — Count or Amount.
 * When Amount is selected, a dynamic numeric field picker is shown
 * filtered from getObjectInfo fields (Currency, Double, Integer types).
 */
import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import { fieldLabel } from 'c/dsUtils';

const NUMERIC_TYPES = new Set(['Currency', 'Double', 'Int', 'Long', 'Percent']);

export default class DsMetricSelector extends LightningElement {

    @api objectApiName = '';

    _metricType = 'COUNT';
    @api get metricType() { return this._metricType; }
    set metricType(val) {
        this._metricType = val;
        this.internalMetricType = val || 'COUNT';
    }

    _metricField = '';
    @api get metricField() { return this._metricField; }
    set metricField(val) {
        this._metricField = val;
        this.internalMetricField = val || '';
    }

    internalMetricType = 'COUNT';
    internalMetricField = '';
    numericFieldOptions = [];

    get metricTypeOptions() {
        return [
            { label: 'Count',  value: 'COUNT' },
            { label: 'Amount', value: 'AMOUNT' }
        ];
    }

    get isAmount() {
        return this.internalMetricType === 'AMOUNT';
    }

    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            const fields = data.fields;
            this.numericFieldOptions = Object.keys(fields)
                .filter(key => NUMERIC_TYPES.has(fields[key].dataType))
                .map(key => ({
                    label: fieldLabel(fields[key], key),
                    value: key
                }))
                .sort((a, b) => a.label.localeCompare(b.label));
        } else if (error) {
            this.numericFieldOptions = [];
        }
    }

    handleMetricTypeChange(event) {
        this.internalMetricType = event.detail.value;
        if (this.internalMetricType === 'COUNT') {
            this.internalMetricField = '';
        }
        this._fireChange();
    }

    handleMetricFieldChange(event) {
        this.internalMetricField = event.detail.value;
        this._fireChange();
    }

    _fireChange() {
        this.dispatchEvent(new CustomEvent('metricchange', {
            detail: {
                metricType: this.internalMetricType,
                metricField: this.internalMetricField
            }
        }));
    }
}
