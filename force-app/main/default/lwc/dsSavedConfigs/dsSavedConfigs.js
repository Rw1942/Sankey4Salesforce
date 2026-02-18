/**
 * Story 9.1 — Save Sankey definition (object, filters, steps, metric).
 * Story 9.2 — Load saved Sankey (reopen without rebuilding).
 *
 * Uses SankeyConfigRepository Apex for CRUD on DS_Sankey_Config__c.
 * Fires 'saveconfig' and 'configloaded' events to parent.
 */
import { LightningElement, api, track, wire } from 'lwc';
import saveConfig from '@salesforce/apex/SankeyConfigRepository.saveConfig';
import getMyConfigs from '@salesforce/apex/SankeyConfigRepository.getMyConfigs';
import deleteConfig from '@salesforce/apex/SankeyConfigRepository.deleteConfig';
import { refreshApex } from '@salesforce/apex';

export default class DsSavedConfigs extends LightningElement {

    @api config = {};

    @track savedConfigs = [];
    @track showSaveDialog = false;
    @track saveName = '';
    @track isSaving = false;

    _wiredResult;

    // Story 9.2: Load user's saved configs on init
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

    get isSaveDisabled() {
        return !this.saveName || this.isSaving;
    }

    /* ═══ Save Flow ═══════════════════════════════════════════════ */

    handleSaveClick() {
        this.showSaveDialog = true;
        this.saveName = '';
    }

    handleNameChange(event) {
        this.saveName = event.target.value;
    }

    handleCancelSave() {
        this.showSaveDialog = false;
    }

    // Story 9.1: Serialize current config and save via Apex
    async handleConfirmSave() {
        this.isSaving = true;
        try {
            const payload = {
                name: this.saveName,
                objectApiName: this.config.objectApiName,
                filters: this.config.filters,
                pathFields: this.config.pathFields,
                metricType: this.config.metricType,
                metricField: this.config.metricField,
                recordIdField: this.config.recordIdField,
                nullHandling: this.config.nullHandling
            };
            await saveConfig({ configJson: JSON.stringify(payload) });
            this.showSaveDialog = false;

            // Refresh the saved configs list
            await refreshApex(this._wiredResult);

            this.dispatchEvent(new CustomEvent('saveconfig'));
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Save error:', err);
        } finally {
            this.isSaving = false;
        }
    }

    /* ═══ Load Flow ══════════════════════════════════════════════ */

    // Story 9.2: Load selected saved config — no rebuild needed
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
