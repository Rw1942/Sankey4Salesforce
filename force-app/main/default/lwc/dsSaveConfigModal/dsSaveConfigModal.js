import LightningModal from 'lightning/modal';
import { api } from 'lwc';

export default class DsSaveConfigModal extends LightningModal {
    @api configName = '';

    get isSaveDisabled() {
        return !this.configName;
    }

    handleNameChange(event) {
        this.configName = event.target.value;
    }

    handleCancel() {
        this.close(null);
    }

    handleSave() {
        if (this.configName) {
            this.close(this.configName);
        }
    }
}
