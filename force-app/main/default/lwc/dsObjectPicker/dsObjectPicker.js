/**
 * Story 2.1 — Choose Salesforce object.
 * Permission-aware object picker using Apex to retrieve queryable objects.
 * Shows label + API name in a searchable combobox.
 */
import { LightningElement, api, track, wire } from 'lwc';
import getQueryableObjects from '@salesforce/apex/SankeyController.getQueryableObjects';

export default class DsObjectPicker extends LightningElement {

    @api selectedObject = '';

    @track searchTerm = '';
    @track allOptions = [];
    @track error;

    _objectLabelMap = {};

    // Story 2.1: Wire to Apex to get permission-aware queryable objects
    @wire(getQueryableObjects)
    wiredObjects({ error, data }) {
        if (data) {
            const parsed = JSON.parse(data);
            this.allOptions = parsed.map(obj => ({
                label: obj.label + ' (' + obj.apiName + ')',
                value: obj.apiName
            }));
            this._objectLabelMap = {};
            parsed.forEach(obj => {
                this._objectLabelMap[obj.apiName] = obj.label + ' (' + obj.apiName + ')';
            });
        } else if (error) {
            this.error = error;
            this.allOptions = [];
        }
    }

    // Story 2.1: Searchable — filter options by search term
    get filteredOptions() {
        if (!this.searchTerm) return this.allOptions;
        const term = this.searchTerm.toLowerCase();
        return this.allOptions.filter(opt =>
            opt.label.toLowerCase().includes(term)
        );
    }

    get selectedObjectLabel() {
        return this._objectLabelMap[this.selectedObject] || this.selectedObject;
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
    }

    // Story 2.1: Fire objectselect event with objectApiName
    handleObjectChange(event) {
        const objectApiName = event.detail.value;
        this.selectedObject = objectApiName;
        this.dispatchEvent(new CustomEvent('objectselect', {
            detail: { objectApiName }
        }));
    }
}
