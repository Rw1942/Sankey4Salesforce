/**
 * Permission-aware Salesforce object autocomplete.
 * Uses Apex to retrieve queryable objects and lets users type to filter.
 */
import { LightningElement, api, wire } from 'lwc';
import getQueryableObjects from '@salesforce/apex/SankeyController.getQueryableObjects';

export default class DsObjectPicker extends LightningElement {

    _selectedObject = '';

    searchTerm = '';
    allOptions = [];
    error;
    isDropdownOpen = false;
    isEditing = false;
    blurTimeout;

    _objectLabelMap = {};

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
            const parsed = JSON.parse(data);
            this.allOptions = parsed
                .map(obj => ({
                    label: obj.label + ' (' + obj.apiName + ')',
                    value: obj.apiName
                }))
                .sort((a, b) => a.label.localeCompare(b.label));
            this._objectLabelMap = {};
            parsed.forEach(obj => {
                this._objectLabelMap[obj.apiName] = obj.label + ' (' + obj.apiName + ')';
            });
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.allOptions = [];
            this._objectLabelMap = {};
        }
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
