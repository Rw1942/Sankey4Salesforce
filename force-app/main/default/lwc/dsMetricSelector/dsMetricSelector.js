/**
 * Story 2.3 — Select metric (Count or Amount).
 * When Amount is selected, a dynamic numeric field picker is shown
 * filtered from getObjectInfo fields (Currency, Double, Integer types).
 */
import { LightningElement, api, track, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

// Story 2.3: Allowed numeric data types for Amount metric
const NUMERIC_TYPES = new Set(['Currency', 'Double', 'Int', 'Long', 'Percent']);

export default class DsMetricSelector extends LightningElement {

    @api objectApiName = '';
    @api metricType = 'COUNT';
    @api metricField = '';

    @track internalMetricType = 'COUNT';
    @track internalMetricField = '';
    @track numericFieldOptions = [];

    get metricTypeOptions() {
        return [
            { label: 'Count',  value: 'COUNT' },
            { label: 'Amount', value: 'AMOUNT' }
        ];
    }

    get isAmount() {
        return this.internalMetricType === 'AMOUNT';
    }

    connectedCallback() {
        this.internalMetricType = this.metricType || 'COUNT';
        this.internalMetricField = this.metricField || '';
    }

    // Story 2.3: Dynamic numeric field picker via getObjectInfo
    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            const fields = data.fields;
            this.numericFieldOptions = Object.keys(fields)
                .filter(key => NUMERIC_TYPES.has(fields[key].dataType))
                .map(key => ({
                    label: fields[key].label + ' (' + key + ')',
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

    // Story 2.3: Fire metricchange event to parent
    _fireChange() {
        this.dispatchEvent(new CustomEvent('metricchange', {
            detail: {
                metricType: this.internalMetricType,
                metricField: this.internalMetricField
            }
        }));
    }
}
