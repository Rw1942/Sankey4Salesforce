/**
 * Story 3.1 — Select the path fields (ordered stage fields).
 * Story 3.2 — Handle missing values (null handling strategy).
 * Story 3.3 — Record identifier selection (default: Id).
 *
 * Only Picklist, Lookup, and Text fields are allowed per acceptance criteria.
 * Uses lightning-dual-listbox for ordered selection with minimum 2 steps.
 */
import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

// Story 3.1: Only allow these field types for path columns
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

    // Story 3.1: Wire getObjectInfo for field metadata, filter to allowed types
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

            // Story 3.3: ID field options — all unique-capable fields
            this.idFieldOptions = Object.keys(fields)
                .filter(key => fields[key].dataType === 'Reference' ||
                               fields[key].dataType === 'String' ||
                               key === 'Id' || key === 'Name')
                .map(key => ({
                    label: fields[key].label + ' (' + key + ')',
                    value: key
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            // Story 3.3: Ensure Id is always an option
            if (!this.idFieldOptions.find(o => o.value === 'Id')) {
                this.idFieldOptions.unshift({ label: 'Record Id (Id)', value: 'Id' });
            }
        } else if (error) {
            this.pathFieldOptions = [];
            this.idFieldOptions = [];
        }
    }

    // Story 3.1: Dual listbox change — ordered selection
    handlePathChange(event) {
        this.internalSelected = event.detail.value;
        this._fireConfigured();
    }

    // Story 3.2: Null handling change
    handleNullChange(event) {
        this.internalNullHandling = event.detail.value;
        this._fireConfigured();
    }

    // Story 3.3: Record ID field change
    handleIdFieldChange(event) {
        this.internalRecordIdField = event.detail.value;
        this._fireConfigured();
    }

    // Story 3.1: Fire pathconfigured event with full path config
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
