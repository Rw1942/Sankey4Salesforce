/**
 * First-time empty state with guided onboarding, example use cases,
 * and quick-load for saved configurations.
 */
import { LightningElement, wire } from 'lwc';
import getMyConfigs from '@salesforce/apex/SankeyConfigRepository.getMyConfigs';

export default class DsEmptyState extends LightningElement {

    savedConfigs = [];

    @wire(getMyConfigs)
    wiredConfigs(result) {
        if (result.data) {
            const parsed = JSON.parse(result.data);
            this.savedConfigs = parsed.map(c => ({
                ...c,
                label: c.name,
                subtitle: c.objectApiName
            }));
        } else if (result.error) {
            this.savedConfigs = [];
        }
    }

    get hasSavedConfigs() {
        return this.savedConfigs && this.savedConfigs.length > 0;
    }

    get examplesColumnClass() {
        return this.hasSavedConfigs
            ? 'slds-col slds-size_1-of-1 slds-medium-size_7-of-12'
            : 'slds-col slds-size_1-of-1';
    }

    handleStart() {
        this.dispatchEvent(new CustomEvent('start'));
    }

    handleConfigSelect(event) {
        const selectedId = event.currentTarget.dataset.id;
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
