/**
 * Permission-aware Salesforce object autocomplete with approximate record counts.
 * Uses Apex to retrieve queryable objects and the /limits/recordCount REST API
 * for per-object counts. Sorted by count descending by default.
 */
import { LightningElement, api, wire } from 'lwc';
import getQueryableObjects from '@salesforce/apex/SankeyController.getQueryableObjects';
import getObjectRecordCounts from '@salesforce/apex/SankeyController.getObjectRecordCounts';

function formatCount(n) {
    if (n == null) return '';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
}

function formatCountExact(n) {
    if (n == null) return '';
    return n.toLocaleString() + ' records';
}

export default class DsObjectPicker extends LightningElement {

    _selectedObject = '';

    searchTerm = '';
    allOptions = [];
    error;
    isDropdownOpen = false;
    isEditing = false;
    blurTimeout;

    _objectLabelMap = {};
    _rawObjects = [];
    _recordCounts = {};

    @api
    get selectedObject() {
        return this._selectedObject;
    }

    set selectedObject(value) {
        this._selectedObject = value || '';
    }

    @wire(getQueryableObjects)
    wiredObjects({ error, data }) {
        if (data) {
            this._rawObjects = JSON.parse(data);
            this.error = undefined;
            this._buildOptions();
        } else if (error) {
            this.error = error;
            this._rawObjects = [];
            this.allOptions = [];
            this._objectLabelMap = {};
        }
    }

    connectedCallback() {
        getObjectRecordCounts()
            .then(result => {
                this._recordCounts = JSON.parse(result);
                this._buildOptions();
            })
            .catch(() => {
                this._recordCounts = {};
            });
    }

    _buildOptions() {
        if (!this._rawObjects.length) return;

        const counts = this._recordCounts;
        const hasCounts = Object.keys(counts).length > 0;
        this._objectLabelMap = {};

        const mapped = this._rawObjects.map(obj => {
            const label = obj.label + ' (' + obj.apiName + ')';
            const count = counts[obj.apiName] ?? null;
            this._objectLabelMap[obj.apiName] = label;
            return {
                label,
                value: obj.apiName,
                count,
                countLabel: formatCount(count),
                countTitle: formatCountExact(count)
            };
        });

        const MIN_RECORDS = 10;
        this.allOptions = (hasCounts
                ? mapped.filter(opt => opt.count >= MIN_RECORDS)
                : mapped)
            .sort((a, b) => {
                const ca = a.count ?? -1;
                const cb = b.count ?? -1;
                if (cb !== ca) return cb - ca;
                return a.label.localeCompare(b.label);
            });
    }

    get filteredOptions() {
        if (!this.searchTerm) return this.allOptions;
        const term = this.searchTerm.toLowerCase();
        return this.allOptions.filter(opt =>
            opt.label.toLowerCase().includes(term) ||
            opt.value.toLowerCase().includes(term)
        );
    }

    get selectedObjectLabel() {
        return this._objectLabelMap[this.selectedObject] || this.selectedObject;
    }

    get displayValue() {
        return this.isEditing ? this.searchTerm : this.selectedObjectLabel;
    }

    get showDropdown() {
        return this.isDropdownOpen && !this.error && (this.filteredOptions.length > 0 || this.showNoResults);
    }

    get showNoResults() {
        return this.searchTerm.length > 0 && this.filteredOptions.length === 0;
    }

    get comboboxClass() {
        let classes = 'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click';
        if (this.showDropdown) {
            classes += ' slds-is-open';
        }
        return classes;
    }

    get ariaExpanded() {
        return this.showDropdown ? 'true' : 'false';
    }

    handleInput(event) {
        this.searchTerm = event.target.value.trimStart();
        this.isDropdownOpen = true;
        this.isEditing = true;
    }

    handleFocus() {
        if (this.blurTimeout) {
            clearTimeout(this.blurTimeout);
            this.blurTimeout = null;
        }

        this.isEditing = true;
        if (this.selectedObject && !this.searchTerm) {
            this.searchTerm = '';
        }
        this.isDropdownOpen = true;
    }

    handleBlur() {
        // Delay closing so option mousedown can run before focus leaves the input.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.blurTimeout = setTimeout(() => {
            this.isDropdownOpen = false;
            this.isEditing = false;
            this.searchTerm = '';
            this.blurTimeout = null;
        }, 200);
    }

    disconnectedCallback() {
        if (this.blurTimeout) {
            clearTimeout(this.blurTimeout);
            this.blurTimeout = null;
        }
    }

    handleOptionSelect(event) {
        event.preventDefault();
        const objectApiName = event.currentTarget.dataset.value;
        const selectedLabel = event.currentTarget.dataset.label;
        this.selectedObject = objectApiName;
        this.searchTerm = selectedLabel;
        this.isDropdownOpen = false;
        this.isEditing = false;
        this.dispatchEvent(new CustomEvent('objectselect', {
            detail: { objectApiName }
        }));
    }
}
