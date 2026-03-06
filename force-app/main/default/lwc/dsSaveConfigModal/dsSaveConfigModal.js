import LightningModal from 'lightning/modal';
import { api } from 'lwc';

export default class DsSaveConfigModal extends LightningModal {
    _name = '';

    @api get configName() { return this._name; }
    set configName(val) { this._name = val || ''; }

    get isSaveDisabled() {
        return !this._name || !this._name.trim();
    }

    handleNameChange(event) {
        this._name = event.target.value;
    }

    handleCancel() {
        this.close(null);
    }

    handleSave() {
        const trimmed = this._name.trim();
        if (trimmed) {
            this.close(trimmed);
        }
    }
}
