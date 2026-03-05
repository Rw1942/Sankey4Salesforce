/**
 * Path field selector with ordered multi-select, null handling, and record ID field.
 * Only Picklist, Lookup, and Text fields are allowed.
 * Uses lightning-dual-listbox for ordered selection with minimum 2 steps.
 */
import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

const ALLOWED_TYPES = new Set(['Picklist', 'Reference', 'String', 'TextArea', 'Phone', 'Email', 'Url']);

export default class DsPathSelector extends LightningElement {

    @api objectApiName = '';

    _selectedFields = [];
    @api get selectedFields() { return this._selectedFields; }
    set selectedFields(val) {
        this._selectedFields = val;
        this.internalSelected = [...(val || [])];
    }

    _nullHandling = 'GROUP_UNKNOWN';
    @api get nullHandling() { return this._nullHandling; }
    set nullHandling(val) {
        this._nullHandling = val;
        this.internalNullHandling = val || 'GROUP_UNKNOWN';
    }

    _recordIdField = 'Id';
    @api get recordIdField() { return this._recordIdField; }
    set recordIdField(val) {
        this._recordIdField = val;
        this.internalRecordIdField = val || 'Id';
    }

    pathFieldOptions = [];
    idFieldOptions = [];
    internalSelected = [];
    internalNullHandling = 'GROUP_UNKNOWN';
    internalRecordIdField = 'Id';

    get nullHandlingOptions() {
        return [
            { label: 'Stop path',              value: 'STOP' },
            { label: 'Group as "Unknown"',     value: 'GROUP_UNKNOWN' },
            { label: 'Carry forward last value', value: 'CARRY_FORWARD' }
        ];
    }

    get showMinWarning() {
        return this.internalSelected.length > 0 && this.internalSelected.length < 2;
    }

    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            const fields = data.fields;
            this.pathFieldOptions = Object.keys(fields)
                .filter(key => ALLOWED_TYPES.has(fields[key].dataType))
                .map(key => ({
                    label: fields[key].label + ' (' + key + ')',
                    value: key
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            this.idFieldOptions = Object.keys(fields)
                .filter(key => fields[key].dataType === 'Reference' ||
                               fields[key].dataType === 'String' ||
                               key === 'Id' || key === 'Name')
                .map(key => ({
                    label: fields[key].label + ' (' + key + ')',
                    value: key
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            if (!this.idFieldOptions.find(o => o.value === 'Id')) {
                this.idFieldOptions.unshift({ label: 'Record Id (Id)', value: 'Id' });
            }
        } else if (error) {
            this.pathFieldOptions = [];
            this.idFieldOptions = [];
        }
    }

    handlePathChange(event) {
        this.internalSelected = event.detail.value;
        this._fireConfigured();
    }

    handleNullChange(event) {
        this.internalNullHandling = event.detail.value;
        this._fireConfigured();
    }

    handleIdFieldChange(event) {
        this.internalRecordIdField = event.detail.value;
        this._fireConfigured();
    }

    _fireConfigured() {
        this.dispatchEvent(new CustomEvent('pathconfigured', {
            detail: {
                pathFields: [...this.internalSelected],
                nullHandling: this.internalNullHandling,
                recordIdField: this.internalRecordIdField
            }
        }));
    }
}
