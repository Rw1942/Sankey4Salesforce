/**
 * Path field selector with ordered multi-select, null handling, and record ID field.
 * Only Picklist, Lookup, and Text fields are allowed.
 * Uses lightning-dual-listbox for ordered selection with minimum 2 steps.
 */
import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import getFieldPopulationStats from '@salesforce/apex/SankeyController.getFieldPopulationStats';
import { sortFieldKeysByType, fieldLabel } from 'c/dsUtils';

const ALLOWED_TYPES = new Set(['Picklist', 'Reference', 'String', 'TextArea', 'Phone', 'Email', 'Url']);

const MAX_AUTO_FIELDS = 5;

/**
 * Auto-selection scoring — three components, 100 points max per field.
 *
 * 1. Data type score (0–40):  TYPE_SCORE[dataType]
 *      Picklist  = 40  — discrete categorical values make ideal Sankey nodes
 *      Reference = 25  — lookup relationships show meaningful entity flow
 *      Text      = 10  — free-text fields tend toward high cardinality
 *
 * 2. Population score (0–30): recentPct * 0.3
 *      Well-populated fields rank higher (90% → 27 pts, 50% → 15 pts).
 *      Defaults to 15 when stats are unavailable for a field.
 *
 * 3. Cardinality score (0–30): based on uniqueValues from the sample
 *      3–20 unique values  → 30 pts  (ideal for readable Sankey diagrams)
 *      2 or 21–40          → 15 pts  (usable but less ideal)
 *      0–1 or 41+          →  0 pts  (constant or too many nodes)
 *      Defaults to 15 when stats are unavailable.
 *
 * Total = typeScore + populationScore + cardinalityScore.
 * Ties broken alphabetically by field label.
 */
const TYPE_SCORE = {
    Picklist: 40,
    Reference: 25,
    String: 10, Phone: 10, Email: 10, Url: 10, TextArea: 10
};

function cardinalityScore(uniqueValues) {
    if (uniqueValues <= 1) return 0;
    if (uniqueValues <= 20) return 30;
    if (uniqueValues <= 40) return 15;
    return 0;
}

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
    _fieldTypeCache = {};
    _pendingAutoSelect = false;

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

            const addressCompounds = new Set(
                Object.keys(fields).filter(k => fields[k].dataType === 'Address')
            );

            const allowedKeys = Object.keys(fields).filter(key => {
                if (!ALLOWED_TYPES.has(fields[key].dataType)) return false;
                const compound = fields[key].compoundFieldName;
                return !(compound && addressCompounds.has(compound));
            });

            const sortedKeys = sortFieldKeysByType(allowedKeys, fields);

            this._fieldKeyCache = sortedKeys;
            this._baseLabels = {};
            for (const key of sortedKeys) {
                this._baseLabels[key] = fieldLabel(fields[key], key);
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
                    label: fieldLabel(fields[key], key),
                    value: key
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            if (!this.idFieldOptions.find(o => o.value === 'Id')) {
                this.idFieldOptions.unshift({ label: 'Record Id (Id)', value: 'Id' });
            }

            this._fieldTypeCache = {};
            for (const key of sortedKeys) {
                this._fieldTypeCache[key] = fields[key].dataType;
            }

            this._pendingAutoSelect = this.internalSelected.length === 0;
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
                        const uv = s.sampleSize > 0 ? s.uniqueValues + ' values' : '';
                        suffix = ' \u2014 Recent: ' + recent + ' | Older: ' + older;
                        if (uv) suffix += ' | ' + uv;
                    }
                    return {
                        label: this._baseLabels[key] + suffix,
                        value: key
                    };
                });
                if (this._pendingAutoSelect) {
                    this._pendingAutoSelect = false;
                    this._autoSelectTopFields(stats);
                }
            })
            .catch(err => {
                console.warn('Field population stats unavailable:', err?.body?.message || err); // eslint-disable-line no-console
                if (this._pendingAutoSelect) {
                    this._pendingAutoSelect = false;
                    this._autoSelectFallback();
                }
            })
            .finally(() => { this.loadingStats = false; });
    }

    /**
     * Scores and ranks all allowed fields, then auto-selects the top MAX_AUTO_FIELDS.
     * See the TYPE_SCORE / cardinalityScore constants for the full scoring breakdown.
     */
    _autoSelectTopFields(stats) {
        const scored = this._fieldKeyCache.map(key => {
            const dataType = this._fieldTypeCache[key];
            const typeScore = TYPE_SCORE[dataType] ?? 0;
            const s = stats[key];
            const populationPts = s && s.recentSize > 0
                ? s.recent * 0.3
                : 15;
            const cardinalityPts = s && s.sampleSize > 0
                ? cardinalityScore(s.uniqueValues)
                : 15;
            return {
                key,
                score: typeScore + populationPts + cardinalityPts,
                label: this._baseLabels[key] || key
            };
        });

        scored.sort((a, b) =>
            b.score !== a.score ? b.score - a.score : a.label.localeCompare(b.label)
        );

        const top = scored.slice(0, MAX_AUTO_FIELDS).map(e => e.key);
        if (top.length > 0) {
            this.internalSelected = top;
            this._fireConfigured(true);
        }
    }

    _autoSelectFallback() {
        const picklists = this._fieldKeyCache
            .filter(key => this._fieldTypeCache[key] === 'Picklist')
            .slice(0, MAX_AUTO_FIELDS);
        if (picklists.length > 0) {
            this.internalSelected = picklists;
            this._fireConfigured(true);
        }
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
