import { LightningElement, api, wire } from 'lwc';
import saveConfig from '@salesforce/apex/SankeyConfigRepository.saveConfig';
import getMyConfigs from '@salesforce/apex/SankeyConfigRepository.getMyConfigs';
import { refreshApex } from '@salesforce/apex';
import DsSaveConfigModal from 'c/dsSaveConfigModal';

export default class DsSavedConfigs extends LightningElement {

    @api config = {};

    savedConfigs = [];
    _wiredResult;

    @wire(getMyConfigs)
    wiredConfigs(result) {
        this._wiredResult = result;
        if (result.data) {
            const parsed = JSON.parse(result.data);
            this.savedConfigs = parsed.map(c => ({
                ...c,
                label: c.name + ' (' + c.objectApiName + ')'
            }));
        } else if (result.error) {
            this.savedConfigs = [];
        }
    }

    get hasSavedConfigs() {
        return this.savedConfigs && this.savedConfigs.length > 0;
    }

    async handleSaveClick() {
        const configName = await DsSaveConfigModal.open({
            size: 'small',
            label: 'Save Sankey Configuration'
        });

        if (!configName) return;

        try {
            const payload = {
                name: configName,
                objectApiName: this.config.objectApiName,
                filters: this.config.filters,
                pathFields: this.config.pathFields,
                metricType: this.config.metricType,
                metricField: this.config.metricField,
                recordIdField: this.config.recordIdField,
                nullHandling: this.config.nullHandling
            };
            await saveConfig({ configJson: JSON.stringify(payload) });
            await refreshApex(this._wiredResult);
            this.dispatchEvent(new CustomEvent('saveconfig'));
        } catch (err) {
            this.dispatchEvent(new CustomEvent('saveerror', {
                detail: { message: err.body ? err.body.message : err.message }
            }));
        }
    }

    handleLoadSelect(event) {
        const selectedId = event.detail.value;
        if (selectedId === 'none') return;

        const found = this.savedConfigs.find(c => c.id === selectedId);
        if (found) {
            this.dispatchEvent(new CustomEvent('configloaded', {
                detail: {
                    config: {
                        objectApiName: found.objectApiName,
                        filters: found.filters || [],
                        pathFields: found.pathFields || [],
                        metricType: found.metricType || 'COUNT',
                        metricField: found.metricField || '',
                        recordIdField: found.recordIdField || 'Id',
                        nullHandling: found.nullHandling || 'GROUP_UNKNOWN'
                    }
                }
            }));
        }
    }
}
