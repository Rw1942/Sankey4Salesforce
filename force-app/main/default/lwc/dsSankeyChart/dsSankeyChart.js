/**
 * Story 4.2 — View aggregated Sankey diagram.
 * Refactored from sankeyExplorer into a child component that receives data via @api.
 * D3 renders into the lwc:dom="manual" SVG element.
 *
 * Story 4.2: Tooltips include value, record count, and % of total.
 * Story 8.2 (Performance): Incremental updates for mode/trace changes — no SVG rebuild.
 * Section 7.2: Opens record via NavigationMixin (event delegation to parent).
 */
import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3_RESOURCE from '@salesforce/resourceUrl/d3';

const MARGIN       = { top: 32, right: 160, bottom: 20, left: 20 };
const NODE_W       = 18;
const NODE_PAD     = 16;
const BASE_OPACITY = 0.35;
const DIM_OPACITY  = 0.07;
const HI_OPACITY   = 0.72;
const OVERLAY_W    = 4;
const ANIM_MS      = 250;

export default class DsSankeyChart extends LightningElement {

    /* ── Public API (data from parent) ─────────────────────────────── */
    @api nodes = [];
    @api links = [];
    @api records = [];
    @api steps = [];
    @api metric = 'count';
    @api mode = 'AGGREGATE';
    @api selectedRecordId = '';
    @api flowStepIdx = '';
    @api flowTraceValue = '';
    @api traceStep = 0;

    /* ── Reactive tooltip state ────────────────────────────────────── */
    @track tooltipVisible = false;
    @track tooltipTitle   = '';
    @track tooltipDetail  = '';
    @track tooltipExtra   = '';
    @track tooltipX       = 0;
    @track tooltipY       = 0;

    /* ── Private ───────────────────────────────────────────────────── */
    _d3Loaded = false;
    _graph    = null;
    _laid     = null;
    _svg      = null;
    _gLinks   = null;
    _gOverlay = null;
    _gNodes   = null;
    _colorOf  = null;
    _w        = 960;
    _h        = 540;
    _ro       = null;
    _lastDataHash = '';

    /* ═══ Lifecycle ════════════════════════════════════════════════════ */

    renderedCallback() {
        if (!this._d3Loaded) {
            this._d3Loaded = true;
            loadScript(this, D3_RESOURCE + '/d3.min.js')
                .then(() => this._onDataChange())
                .catch(e => {
                    // eslint-disable-next-line no-console
                    console.error('D3 load error:', e);
                });
        } else {
            this._onDataChange();
        }
    }

    disconnectedCallback() {
        if (this._ro) this._ro.disconnect();
    }

    /* ═══ Watch for @api data changes ══════════════════════════════ */

    _onDataChange() {
        if (!this.nodes || this.nodes.length === 0) return;

        const dataHash = JSON.stringify(this.nodes) + this.metric;
        const needsRebuild = dataHash !== this._lastDataHash;

        if (needsRebuild) {
            this._lastDataHash = dataHash;
            this._buildGraph();
            this._initResize();
        } else {
            // Story 8.2: Incremental update — only restyle, don't rebuild SVG
            this._applyHighlight();
        }
    }

    /* ═══ Graph construction (from Apex-returned nodes/links) ═════ */

    _buildGraph() {
        const nodeMap = new Map();
        const linkAgg = new Map();

        for (const n of this.nodes) {
            nodeMap.set(n.id, {
                ...n,
                recordIndices: new Set()
            });
        }

        // Build record index sets on nodes
        for (let ri = 0; ri < this.records.length; ri++) {
            const rec = this.records[ri];
            for (let si = 0; si < this.steps.length; si++) {
                const val = rec[this.steps[si]] || '\u2205';
                const nid = si + '::' + val;
                if (nodeMap.has(nid)) {
                    nodeMap.get(nid).recordIndices.add(ri);
                }
            }
        }

        for (const l of this.links) {
            const riSet = new Set();
            if (l.recordIds) {
                for (let i = 0; i < l.recordIds.length; i++) {
                    const idx = this.records.findIndex(r => r.id === l.recordIds[i]);
                    if (idx >= 0) riSet.add(idx);
                }
            }
            linkAgg.set(l.key, {
                ...l,
                recordIndices: riSet,
                countVal: l.countVal || riSet.size,
                amountVal: l.amountVal || 0
            });
        }

        this._graph = {
            nodes: [...nodeMap.values()],
            nodeMap,
            linkAgg
        };

        // Assign colors
        const labels = [...new Set(this._graph.nodes.map(n => n.label))];
        // eslint-disable-next-line no-undef
        const palette = typeof d3 !== 'undefined' ? d3.schemeTableau10 : [];
        this._colorOf = new Map();
        this._graph.nodes.forEach(n => {
            this._colorOf.set(n.id, palette[labels.indexOf(n.label) % palette.length] || '#1b5faa');
        });
    }

    _linksForLayout() {
        const useAmt = this.metric === 'amount';
        return Array.from(this._graph.linkAgg.values()).map(l => ({
            source: l.source,
            target: l.target,
            value: useAmt ? (l.amountVal || 1) : (l.countVal || 1),
            key: l.key,
            recordIndices: l.recordIndices,
            countVal: l.countVal,
            amountVal: l.amountVal
        }));
    }

    /* ═══ Resize Observer ══════════════════════════════════════════ */

    _initResize() {
        const ctr = this.template.querySelector('.chart-container');
        if (!ctr) return;

        if (this._ro) this._ro.disconnect();
        this._ro = new ResizeObserver(entries => {
            for (const e of entries) {
                if (e.contentRect.width > 0) {
                    this._w = e.contentRect.width;
                    this._h = Math.max(440, Math.round(this._w * 0.55));
                    this._draw();
                }
            }
        });
        this._ro.observe(ctr);
    }

    /* ═══ Drawing ══════════════════════════════════════════════════ */

    _draw() {
        /* eslint-disable no-undef */
        if (typeof d3 === 'undefined' || !this._graph) return;

        const svg = d3.select(this.template.querySelector('svg.sankey'));
        svg.selectAll('*').remove();
        svg.attr('width', this._w).attr('height', this._h);

        const iw = this._w - MARGIN.left - MARGIN.right;
        const ih = this._h - MARGIN.top  - MARGIN.bottom;
        const root = svg.append('g')
            .attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');

        if (typeof d3.sankey !== 'function') {
            root.append('text')
                .attr('x', iw / 2).attr('y', ih / 2)
                .attr('text-anchor', 'middle').attr('class', 'placeholder-text')
                .text('d3-sankey not found \u2014 rebuild d3.zip with d3-sankey bundled.');
            return;
        }

        const nodesCopy = this._graph.nodes.map(n => ({ ...n }));
        const linksCopy = this._linksForLayout();

        const layout = d3.sankey()
            .nodeId(n => n.id)
            .nodeWidth(NODE_W)
            .nodePadding(NODE_PAD)
            .extent([[0, 0], [iw, ih]]);

        const result = layout({ nodes: nodesCopy, links: linksCopy });
        this._laid = result;

        this._drawHeaders(root, result.nodes);
        this._drawLinks(root, result.links);
        this._drawNodes(root, result.nodes, iw);

        this._svg = svg;
        this._applyHighlight();
        /* eslint-enable no-undef */
    }

    _drawHeaders(root, nodes) {
        const xByStep = new Map();
        nodes.forEach(n => {
            if (!xByStep.has(n.stepIndex)) {
                xByStep.set(n.stepIndex, (n.x0 + n.x1) / 2);
            }
        });
        const g = root.append('g').attr('class', 'step-headers');
        xByStep.forEach((x, si) => {
            g.append('text')
                .attr('x', x).attr('y', -12)
                .attr('text-anchor', 'middle')
                .attr('class', 'step-header')
                .text(this.steps[si] || '');
        });
    }

    _drawLinks(root, links) {
        /* eslint-disable no-undef */
        this._gLinks = root.append('g').attr('class', 'g-links');
        this._gLinks.selectAll('path')
            .data(links, l => l.key)
            .join('path')
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('class', 'sankey-link')
            .attr('stroke', l => this._colorOf.get(l.source.id) || '#aec6e8')
            .attr('stroke-width', l => Math.max(1, l.width))
            .attr('stroke-opacity', BASE_OPACITY)
            .on('mouseover', (ev, d) => this._onLinkOver(ev, d))
            .on('mouseout', () => this._onOut());

        this._gOverlay = root.append('g').attr('class', 'g-overlay');
        /* eslint-enable no-undef */
    }

    _drawNodes(root, nodes, iw) {
        this._gNodes = root.append('g').attr('class', 'g-nodes');
        const ng = this._gNodes.selectAll('g')
            .data(nodes, n => n.id)
            .join('g')
            .attr('transform', n => 'translate(' + n.x0 + ',' + n.y0 + ')')
            .style('cursor', 'pointer')
            .on('mouseover', (ev, d) => this._onNodeOver(ev, d))
            .on('mouseout', () => this._onOut())
            .on('click', (ev, d) => this._onNodeClick(d));

        ng.append('rect')
            .attr('width', n => n.x1 - n.x0)
            .attr('height', n => Math.max(1, n.y1 - n.y0))
            .attr('fill', n => this._colorOf.get(n.id) || '#1b5faa')
            .attr('rx', 3).attr('ry', 3)
            .attr('class', 'node-rect');

        ng.append('text')
            .attr('x', n => (n.x0 < iw / 2 ? (n.x1 - n.x0) + 6 : -6))
            .attr('y', n => (n.y1 - n.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', n => (n.x0 < iw / 2 ? 'start' : 'end'))
            .attr('class', 'node-label')
            .text(n => n.label);
    }

    /* ═══ Highlighting (Story 8.2: incremental, no SVG rebuild) ══ */

    _applyHighlight() {
        if (!this._gLinks || !this._laid) return;

        const activeSet = this._activeRecordSet();

        this._gLinks.selectAll('path')
            .transition().duration(ANIM_MS)
            .attr('stroke-opacity', d => {
                if (!activeSet) return BASE_OPACITY;
                return this._intersects(d.recordIndices, activeSet) ? HI_OPACITY : DIM_OPACITY;
            });

        this._gNodes.selectAll('g').select('.node-rect')
            .transition().duration(ANIM_MS)
            .attr('opacity', d => {
                if (!activeSet) return 1;
                return this._intersects(d.recordIndices, activeSet) ? 1 : 0.2;
            });

        this._gOverlay.selectAll('*').remove();
        if (this.mode === 'RECORD_TRACE' && this.selectedRecordId) {
            this._drawOverlay();
        }
    }

    _activeRecordSet() {
        if (this.mode === 'RECORD_TRACE' && this.selectedRecordId) {
            const ri = this.records.findIndex(r => r.id === this.selectedRecordId);
            return ri >= 0 ? new Set([ri]) : null;
        }
        if (this.mode === 'FLOW_TRACE' && this.flowTraceValue && this.flowStepIdx !== '') {
            const nid = this.flowStepIdx + '::' + this.flowTraceValue;
            const node = this._graph.nodeMap.get(nid);
            return node ? new Set(node.recordIndices) : null;
        }
        return null;
    }

    // Story 5.1: Overlay for record trace with step-through animation
    _drawOverlay() {
        /* eslint-disable no-undef */
        const ri = this.records.findIndex(r => r.id === this.selectedRecordId);
        if (ri < 0 || !this._laid) return;

        const rec = this.records[ri];
        const keys = [];
        const limit = this.traceStep;

        for (let i = 0; i < this.steps.length - 1 && i <= limit; i++) {
            const sv = rec[this.steps[i]]     || '\u2205';
            const tv = rec[this.steps[i + 1]] || '\u2205';
            keys.push(i + '::' + sv + '\u2192' + (i + 1) + '::' + tv);
        }

        const hits = this._laid.links.filter(l => keys.indexOf(l.key) !== -1);

        this._gOverlay.selectAll('path')
            .data(hits)
            .join('path')
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('class', 'overlay-link')
            .attr('stroke', '#ff6900')
            .attr('stroke-width', OVERLAY_W)
            .attr('stroke-opacity', 0.9)
            .attr('stroke-linecap', 'round');
        /* eslint-enable no-undef */
    }

    /* ═══ Hover / click handlers ═══════════════════════════════════ */

    _onNodeOver(event, d) {
        if (this.mode === 'AGGREGATE') {
            this._gLinks.selectAll('path')
                .transition().duration(120)
                .attr('stroke-opacity', l =>
                    (l.source.id === d.id || l.target.id === d.id) ? HI_OPACITY : DIM_OPACITY
                );
            this._gNodes.selectAll('g').select('.node-rect')
                .transition().duration(120)
                .attr('opacity', n =>
                    (n.id === d.id ||
                     this._laid.links.some(l =>
                         (l.source.id === d.id && l.target.id === n.id) ||
                         (l.target.id === d.id && l.source.id === n.id)))
                        ? 1 : 0.25
                );
        }

        // Story 4.2: Tooltip with value, record count, % of total
        this._showTip(event,
            d.label + '  (' + (this.steps[d.stepIndex] || '') + ')',
            this._countLabel(d.recordIndices),
            ''
        );
    }

    _onLinkOver(event, d) {
        if (this.mode === 'AGGREGATE') {
            // eslint-disable-next-line no-undef
            d3.select(event.currentTarget)
                .transition().duration(120)
                .attr('stroke-opacity', 0.75);
        }

        const src = d.source.label || d.source.id;
        const tgt = d.target.label || d.target.id;
        this._showTip(event,
            src + ' \u2192 ' + tgt,
            this._countLabel(d.recordIndices),
            this._sampleNames(d.recordIndices, 3)
        );
    }

    _onOut() {
        this.tooltipVisible = false;
        this._applyHighlight();
    }

    // Story 6.2: Node click fires event for flow trace
    _onNodeClick(d) {
        this.dispatchEvent(new CustomEvent('nodeclick', {
            detail: { stepIndex: d.stepIndex, label: d.label }
        }));
    }

    _showTip(event, title, detail, extra) {
        const box = this.template.querySelector('.chart-container').getBoundingClientRect();
        this.tooltipTitle   = title;
        this.tooltipDetail  = detail;
        this.tooltipExtra   = extra;
        this.tooltipX       = event.clientX - box.left + 14;
        this.tooltipY       = event.clientY - box.top  - 30;
        this.tooltipVisible = true;
    }

    /* ═══ Template getters ═════════════════════════════════════════ */

    get tooltipClass() {
        return 'sankey-tooltip' + (this.tooltipVisible ? ' visible' : '');
    }

    get tooltipStyle() {
        return 'left:' + this.tooltipX + 'px;top:' + this.tooltipY + 'px';
    }

    /* ═══ Utilities ════════════════════════════════════════════════ */

    _intersects(setA, setB) {
        if (!setA || !setB) return false;
        for (const v of setB) {
            if (setA.has(v)) return true;
        }
        return false;
    }

    _sumAmount(idxSet) {
        let s = 0;
        if (idxSet) {
            for (const i of idxSet) s += (this.records[i] ? (this.records[i].amount || 0) : 0);
        }
        return s;
    }

    // Story 4.2: Tooltip includes value, record count, and % of total
    _countLabel(idxSet) {
        const c = idxSet ? idxSet.size : 0;
        const a = this._sumAmount(idxSet);
        const totalRecs = this.records.length;
        const pct = totalRecs > 0 ? ((c / totalRecs) * 100).toFixed(1) : '0.0';
        return c + ' records  \u00b7  $' + this._fmt(a) + '  \u00b7  ' + pct + '% of total';
    }

    _sampleNames(idxSet, max) {
        if (!idxSet || idxSet.size === 0) return '';
        const arr  = [...idxSet].slice(0, max).map(i => this.records[i] ? this.records[i].name : '');
        const rest = idxSet.size - arr.length;
        return arr.join(', ') + (rest > 0 ? ' +' + rest + ' more' : '');
    }

    _fmt(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
        return String(n);
    }
}
