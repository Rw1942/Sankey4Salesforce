/**
 * Insights panel showing contextual metrics and top paths.
 * Receives pre-computed KPI data from parent (computed in Apex SankeyService).
 * Panel is collapsible via toggle event.
 */
import { LightningElement, api } from 'lwc';

export default class DsInsightsPanel extends LightningElement {

    @api kpis = null;
    @api topPaths = [];

    get hasKpis() {
        return this.kpis && this.kpis.totalRecords !== undefined;
    }

    get noKpis() {
        return !this.hasKpis;
    }

    get hasTopPaths() {
        return this.topPaths && this.topPaths.length > 0;
    }

    get formattedTotalAmount() {
        return this._fmt(this.kpis ? this.kpis.totalAmount : 0);
    }

    get formattedAvgAmount() {
        return this._fmt(this.kpis ? this.kpis.avgAmount : 0);
    }

    handleToggle() {
        this.dispatchEvent(new CustomEvent('togglepanel'));
    }

    _fmt(n) {
        if (!n) return '0';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return Number(n).toFixed(0);
    }
}
