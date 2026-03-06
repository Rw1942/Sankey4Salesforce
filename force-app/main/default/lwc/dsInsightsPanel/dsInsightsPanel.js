/**
 * Adaptive insights panel for overview, focused cohorts, and record stories.
 * Receives a pre-shaped insight context from the parent builder.
 */
import { LightningElement, api } from 'lwc';

export default class DsInsightsPanel extends LightningElement {

    @api insightContext = null;

    get hasContext() {
        return !!this.insightContext;
    }

    get noContext() {
        return !this.hasContext;
    }

    get modeLabel() {
        return this.insightContext ? this.insightContext.modeLabel : 'Insights';
    }

    get title() {
        return this.insightContext ? this.insightContext.title : 'Insights';
    }

    get summary() {
        return this.insightContext ? this.insightContext.summary : '';
    }

    get pills() {
        return this.insightContext
            ? (this.insightContext.pills || []).map((label, index) => ({
                id: 'pill-' + index,
                label
            }))
            : [];
    }

    get hasPills() {
        return this.pills.length > 0;
    }

    get cards() {
        return this.insightContext ? this.insightContext.cards || [] : [];
    }

    get hasCards() {
        return this.cards.length > 0;
    }

    get standout() {
        return this.insightContext ? this.insightContext.standout || [] : [];
    }

    get hasStandout() {
        return this.standout.length > 0;
    }

    get pathSectionTitle() {
        return this.insightContext ? this.insightContext.pathSectionTitle : '';
    }

    get pathRows() {
        return this.insightContext ? this.insightContext.pathRows || [] : [];
    }

    get hasPathRows() {
        return this.pathRows.length > 0;
    }

    get storySteps() {
        return this.insightContext ? this.insightContext.storySteps || [] : [];
    }

    get hasStorySteps() {
        return this.storySteps.length > 0;
    }

    get nextSteps() {
        return this.insightContext
            ? (this.insightContext.nextSteps || []).map((label, index) => ({
                id: 'next-' + index,
                label
            }))
            : [];
    }

    get hasNextSteps() {
        return this.nextSteps.length > 0;
    }

    get warnings() {
        return this.insightContext
            ? (this.insightContext.warnings || []).map((label, index) => ({
                id: 'warning-' + index,
                label
            }))
            : [];
    }

    get hasWarnings() {
        return this.warnings.length > 0;
    }

    get showClearFocus() {
        return this.insightContext ? this.insightContext.showClearFocus : false;
    }

    handleToggle() {
        this.dispatchEvent(new CustomEvent('togglepanel'));
    }

    handleClearFocus() {
        this.dispatchEvent(new CustomEvent('clearfocus'));
    }
}
