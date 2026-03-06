/**
 * Combined trace panel for Record Trace and Flow Trace modes.
 * Communicates to parent via custom events; parent delegates to chart for highlighting.
 */
import { LightningElement, api } from 'lwc';

export default class DsTracePanel extends LightningElement {

    @api mode = 'AGGREGATE';
    @api records = [];
    @api steps = [];
    @api stepLabels = [];
    @api selectedRecordId = '';
    @api traceStep = 0;
    @api flowStepIdx = '';
    @api flowTraceValue = '';
    @api flowFocusChain = [];
    @api kpis = null;

    get modeOptions() {
        return [
            { label: 'Aggregated',   value: 'AGGREGATE' },
            { label: 'Record Trace', value: 'RECORD_TRACE' },
            { label: 'Flow Trace',   value: 'FLOW_TRACE' }
        ];
    }

    get recordOptions() {
        if (!this.records) return [];
        return this.records.map(r => ({
            label: (r.name || '') + ' (' + (r.id || '') + ')',
            value: r.id
        }));
    }

    get flowStepOptions() {
        if (!this.steps) return [];
        return this.steps.map((s, i) => ({
            label: (this.stepLabels && this.stepLabels[i]) || s,
            value: String(i)
        }));
    }

    get flowValueOptions() {
        const idx = parseInt(this.flowStepIdx, 10);
        if (isNaN(idx) || idx < 0 || !this.steps || idx >= this.steps.length) return [];
        if (!this.records) return [];
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

    get hasFlowFocusChain() {
        return this.isFlowTrace && this.flowFocusChain && this.flowFocusChain.length > 0;
    }

    get focusChainPills() {
        if (!this.flowFocusChain) return [];
        return this.flowFocusChain.map(({ stepIndex, label }, i) => ({
            id: 'focus-' + i,
            label: ((this.stepLabels && this.stepLabels[stepIndex]) || (this.steps && this.steps[stepIndex]) || 'Step ' + stepIndex) + ': ' + label
        }));
    }

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

    handleModeChange(event) {
        this.dispatchEvent(new CustomEvent('modechange', {
            detail: { value: event.detail.value }
        }));
    }

    handleRecordChange(event) {
        this.dispatchEvent(new CustomEvent('recordselect', {
            detail: { value: event.detail.value }
        }));
    }

    handleOpenRecord() {
        if (this.selectedRecordId) {
            this.dispatchEvent(new CustomEvent('openrecord', {
                detail: { recordId: this.selectedRecordId }
            }));
        }
    }

    handleFlowStepChange(event) {
        this.dispatchEvent(new CustomEvent('flowstepchange', {
            detail: { value: event.detail.value }
        }));
    }

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

    handleResetFlowFocus() {
        this.dispatchEvent(new CustomEvent('resetflowfocus'));
    }
}
