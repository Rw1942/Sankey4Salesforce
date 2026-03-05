/**
 * First-time empty state with guided onboarding and example use cases.
 */
import { LightningElement } from 'lwc';

export default class DsEmptyState extends LightningElement {
    handleStart() {
        this.dispatchEvent(new CustomEvent('start'));
    }
}
