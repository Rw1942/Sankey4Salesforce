/**
 * Path field selector with ordered multi-select, null handling, and record ID field.
 * Only Picklist, Lookup, and Text fields are allowed.
 * Uses lightning-dual-listbox for ordered selection with minimum 2 steps.
 */
import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import getFieldPopulationStats from '@salesforce/apex/SankeyController.getFieldPopulationStats';

const ALLOWED_TYPES = new Set(['Picklist', 'Reference', 'String', 'TextArea', 'Phone', 'Email', 'Url']);

const TYPE_PRIORITY = {
    Picklist: 0,
    String: 1, Phone: 1, Email: 1, Url: 1,
    Currency: 2, Double: 2, Int: 2, Long: 2, Percent: 2
};

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
    loadingStats = false;
    _fieldKeyCache = [];

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

            // Compound Address fields (BillingAddress, etc.) — used to exclude components
            const addressCompounds = new Set(
                Object.keys(fields).filter(k => fields[k].dataType === 'Address')
            );

            const sortedKeys = Object.keys(fields)
                .filter(key => {
                    if (!ALLOWED_TYPES.has(fields[key].dataType)) return false;
                    const compound = fields[key].compoundFieldName;
                    if (compound && addressCompounds.has(compound)) return false;
                    return true;
                })
                .sort((a, b) => {
                    const pa = TYPE_PRIORITY[fields[a].dataType] ?? 3;
                    const pb = TYPE_PRIORITY[fields[b].dataType] ?? 3;
                    return pa !== pb ? pa - pb : fields[a].label.localeCompare(fields[b].label);
                });

            this._fieldKeyCache = sortedKeys;
            this._baseLabels = {};
            for (const key of sortedKeys) {
                this._baseLabels[key] = fields[key].label + ' (' + key + ')';
            }

            this.pathFieldOptions = sortedKeys.map(key => ({
                label: this._baseLabels[key],
                value: key
            }));

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

            if (this.internalSelected.length === 0) {
                const picklists = sortedKeys
                    .filter(key => fields[key].dataType === 'Picklist')
                    .slice(0, 8);
                if (picklists.length > 0) {
                    this.internalSelected = picklists;
                    this._fireConfigured(true);
                }
            }

            this._fetchPopulationStats();
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

    _fetchPopulationStats() {
        if (!this.objectApiName || this._fieldKeyCache.length === 0) return;
        this.loadingStats = true;
        getFieldPopulationStats({
            objectApiName: this.objectApiName,
            fieldApiNames: this._fieldKeyCache
        })
            .then(result => {
                const stats = JSON.parse(result);
                this.pathFieldOptions = this._fieldKeyCache.map(key => {
                    const s = stats[key];
                    let suffix = '';
                    if (s) {
                        const recent = s.recentSize > 0 ? s.recent + '%' : 'n/a';
                        const older = s.olderSize > 0 ? s.older + '%' : 'n/a';
                        suffix = ' \u2014 Recent: ' + recent + ' | Older: ' + older;
                    }
                    return {
                        label: this._baseLabels[key] + suffix,
                        value: key
                    };
                });
            })
            .catch(err => {
                console.warn('Field population stats unavailable:', err?.body?.message || err); // eslint-disable-line no-console
            })
            .finally(() => { this.loadingStats = false; });
    }

    _fireConfigured(autoSelected) {
        this.dispatchEvent(new CustomEvent('pathconfigured', {
            detail: {
                pathFields: [...this.internalSelected],
                nullHandling: this.internalNullHandling,
                recordIdField: this.internalRecordIdField,
                autoSelected: !!autoSelected
            }
        }));
    }
}
