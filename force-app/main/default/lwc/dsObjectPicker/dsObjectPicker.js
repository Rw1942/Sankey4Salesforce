/**
 * Permission-aware, searchable Salesforce object picker.
 * Uses Apex to retrieve queryable objects and shows label + API name.
 */
import { LightningElement, api, wire } from 'lwc';
import getQueryableObjects from '@salesforce/apex/SankeyController.getQueryableObjects';

export default class DsObjectPicker extends LightningElement {

    @api selectedObject = '';

    searchTerm = '';
    allOptions = [];
    error;

    _objectLabelMap = {};

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
        } else if (error) {
            this.error = error;
            this.allOptions = [];
        }
    }

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

    handleObjectChange(event) {
        const objectApiName = event.detail.value;
        this.selectedObject = objectApiName;
        this.dispatchEvent(new CustomEvent('objectselect', {
            detail: { objectApiName }
        }));
    }
}
