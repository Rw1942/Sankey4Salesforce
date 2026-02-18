/**
 * Story 5.1 — Record trace mode with searchable combobox.
 * Story 5.2 — Open record from Sankey via NavigationMixin (delegated to parent).
 * Story 6.1 — Select a step to trace.
 * Story 6.2 — Select a value within the step; KPI summary (total records, amount, conversion %).
 *
 * Combined trace panel handling both Record Trace and Flow Trace modes.
 * Communicates to parent via custom events; parent delegates to chart for highlighting.
 */
import { LightningElement, api } from 'lwc';

export default class DsTracePanel extends LightningElement {

    @api mode = 'AGGREGATE';
    @api records = [];
    @api steps = [];
    @api selectedRecordId = '';
    @api traceStep = 0;
    @api flowStepIdx = '';
    @api flowTraceValue = '';
    @api kpis = null;

    get modeOptions() {
        return [
            { label: 'Aggregated',   value: 'AGGREGATE' },
            { label: 'Record Trace', value: 'RECORD_TRACE' },
            { label: 'Flow Trace',   value: 'FLOW_TRACE' }
        ];
    }

    // Story 5.1: Record options for searchable combobox
    get recordOptions() {
        if (!this.records) return [];
        return this.records.map(r => ({
            label: (r.name || '') + ' (' + (r.id || '') + ')',
            value: r.id
        }));
    }

    // Story 6.1: Flow step options from path columns
    get flowStepOptions() {
        if (!this.steps) return [];
        return this.steps.map((s, i) => ({ label: s, value: String(i) }));
    }

    // Story 6.2: Values within the selected step
    get flowValueOptions() {
        const idx = parseInt(this.flowStepIdx, 10);
        if (isNaN(idx) || idx < 0 || !this.steps || idx >= this.steps.length) return [];
        const col = this.steps[idx];
        const vals = [...new Set(this.records.map(r => r[col] || '\u2205'))].sort();
        return vals.map(v => ({ label: v, value: v }));
    }

    get isRecordTrace() { return this.mode === 'RECORD_TRACE'; }
    get isFlowTrace()   { return this.mode === 'FLOW_TRACE'; }

    get showTraceControls() {
        return this.isRecordTrace && !!this.selectedRecordId;
    }

    get traceStepLabel() {
        const max = this.steps ? this.steps.length - 2 : 0;
        return 'Step ' + this.traceStep + ' / ' + Math.max(0, max);
    }

    // Story 6.2: Show KPIs when flow trace has a selection
    get showFlowKpis() {
        return this.isFlowTrace && this.kpis && this.flowTraceValue;
    }

    get formattedTotalAmount() {
        if (!this.kpis) return '0';
        const n = this.kpis.totalAmount || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
        return String(n);
    }

    /* ═══ Event Handlers ═══════════════════════════════════════════ */

    handleModeChange(event) {
        this.dispatchEvent(new CustomEvent('modechange', {
            detail: { value: event.detail.value }
        }));
    }

    // Story 5.1: Record selected
    handleRecordChange(event) {
        this.dispatchEvent(new CustomEvent('recordselect', {
            detail: { value: event.detail.value }
        }));
    }

    // Story 5.2: Open record in Salesforce (delegated to parent for NavigationMixin)
    handleOpenRecord() {
        if (this.selectedRecordId) {
            this.dispatchEvent(new CustomEvent('openrecord', {
                detail: { recordId: this.selectedRecordId }
            }));
        }
    }

    // Story 6.1: Flow step change
    handleFlowStepChange(event) {
        this.dispatchEvent(new CustomEvent('flowstepchange', {
            detail: { value: event.detail.value }
        }));
    }

    // Story 6.2: Flow value change
    handleFlowValueChange(event) {
        this.dispatchEvent(new CustomEvent('flowvaluechange', {
            detail: { value: event.detail.value }
        }));
    }

    handleTraceNext() {
        this.dispatchEvent(new CustomEvent('tracenext'));
    }

    handleTracePrev() {
        this.dispatchEvent(new CustomEvent('traceprev'));
    }

    handleTraceReset() {
        this.dispatchEvent(new CustomEvent('tracereset'));
    }
}
