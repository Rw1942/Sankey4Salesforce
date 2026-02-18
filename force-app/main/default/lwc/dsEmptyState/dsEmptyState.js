/**
 * Story 1.2 — First-time empty state component.
 * Displays onboarding message with example use cases and a Start CTA.
 * Fires 'start' event when user clicks the Start button.
 */
import { LightningElement } from 'lwc';

export default class DsEmptyState extends LightningElement {
    // Story 1.2: Start CTA fires event to parent
    handleStart() {
        this.dispatchEvent(new CustomEvent('start'));
    }
}
