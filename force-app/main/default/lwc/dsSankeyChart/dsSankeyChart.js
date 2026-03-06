/**
 * Aggregated Sankey diagram rendered via D3.
 * Receives data from parent via @api. D3 renders into the lwc:dom="manual" SVG.
 * Uses @api setters for efficient change detection instead of renderedCallback hashing.
 */
import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3_RESOURCE from '@salesforce/resourceUrl/d3';

const MARGIN       = { top: 48, right: 160, bottom: 20, left: 60 };
const NODE_W       = 18;
const NODE_PAD     = 16;
const BASE_OPACITY = 0.35;
const DIM_OPACITY  = 0.07;
const HI_OPACITY   = 0.72;
const OVERLAY_W    = 4;
const ANIM_MS      = 250;

export default class DsSankeyChart extends LightningElement {

    /* ── @api with setters for change detection ───────────────────── */

    _nodes = [];
    @api get nodes() { return this._nodes; }
    set nodes(val) {
        this._nodes = val || [];
        this._dataChanged = true;
    }

    _links = [];
    @api get links() { return this._links; }
    set links(val) { this._links = val || []; }

    _records = [];
    @api get records() { return this._records; }
    set records(val) { this._records = val || []; }

    _steps = [];
    @api get steps() { return this._steps; }
    set steps(val) { this._steps = val || []; }

    _stepLabels = [];
    @api get stepLabels() { return this._stepLabels; }
    set stepLabels(val) {
        this._stepLabels = val || [];
        this._headersDirty = true;
    }

    _metric = 'count';
    @api get metric() { return this._metric; }
    set metric(val) {
        const prev = this._metric;
        this._metric = val || 'count';
        if (prev !== this._metric) {
            this._dataChanged = true;
        }
    }

    _mode = 'AGGREGATE';
    @api get mode() { return this._mode; }
    set mode(val) {
        this._mode = val || 'AGGREGATE';
        this._highlightDirty = true;
    }

    _selectedRecordId = '';
    @api get selectedRecordId() { return this._selectedRecordId; }
    set selectedRecordId(val) {
        this._selectedRecordId = val || '';
        this._highlightDirty = true;
    }

    _flowStepIdx = '';
    @api get flowStepIdx() { return this._flowStepIdx; }
    set flowStepIdx(val) {
        this._flowStepIdx = val || '';
        this._highlightDirty = true;
    }

    _flowTraceValue = '';
    @api get flowTraceValue() { return this._flowTraceValue; }
    set flowTraceValue(val) {
        this._flowTraceValue = val || '';
        this._highlightDirty = true;
    }

    _traceStep = 0;
    @api get traceStep() { return this._traceStep; }
    set traceStep(val) {
        this._traceStep = val || 0;
        this._highlightDirty = true;
    }

    /* ── Reactive tooltip state ────────────────────────────────────── */
    tooltipVisible = false;
    tooltipTitle   = '';
    tooltipDetail  = '';
    tooltipExtra   = '';
    tooltipX       = 0;
    tooltipY       = 0;

    /* ── Private ───────────────────────────────────────────────────── */
    _d3Loaded      = false;
    _dataChanged   = false;
    _highlightDirty = false;
    _headersDirty  = false;
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

    /* ═══ Lifecycle ════════════════════════════════════════════════════ */

    renderedCallback() {
        if (!this._d3Loaded) {
            this._d3Loaded = true;
            loadScript(this, D3_RESOURCE + '/d3.min.js')
                .then(() => this._processChanges())
                .catch(e => {
                    console.error('D3 load error:', e); // eslint-disable-line no-console
                });
            return;
        }
        this._processChanges();
    }

    disconnectedCallback() {
        if (this._ro) this._ro.disconnect();
    }

    /* ═══ Efficient change processing ══════════════════════════════ */

    _processChanges() {
        if (this._nodes.length === 0) return;

        if (this._dataChanged) {
            this._dataChanged = false;
            this._highlightDirty = false;
            this._headersDirty = false;
            this._buildGraph();
            this._initResize();
        } else if (this._highlightDirty) {
            this._highlightDirty = false;
            this._applyHighlight();
        } else if (this._headersDirty) {
            this._headersDirty = false;
            this._updateHeaderText();
        }
    }

    /* ═══ Graph construction ═══════════════════════════════════════ */

    _buildGraph() {
        const nodeMap = new Map();
        const linkAgg = new Map();

        for (const n of this._nodes) {
            nodeMap.set(n.id, { ...n, recordIndices: new Set() });
        }

        for (let ri = 0; ri < this._records.length; ri++) {
            const rec = this._records[ri];
            for (let si = 0; si < this._steps.length; si++) {
                const val = rec[this._steps[si]] || '\u2205';
                const nid = si + '::' + val;
                if (nodeMap.has(nid)) {
                    nodeMap.get(nid).recordIndices.add(ri);
                }
            }
        }

        const recordIdMap = new Map();
        for (let i = 0; i < this._records.length; i++) {
            recordIdMap.set(this._records[i].id, i);
        }

        for (const l of this._links) {
            const riSet = new Set();
            if (l.recordIds) {
                for (const rid of l.recordIds) {
                    const idx = recordIdMap.get(rid);
                    if (idx !== undefined) riSet.add(idx);
                }
            }
            linkAgg.set(l.key, {
                ...l,
                recordIndices: riSet,
                countVal: l.countVal || riSet.size,
                amountVal: l.amountVal || 0
            });
        }

        this._graph = { nodes: [...nodeMap.values()], nodeMap, linkAgg };

        const labels = [...new Set(this._graph.nodes.map(n => n.label))];
        const palette = [
            '#1b96ff', '#fe9339', '#2e844a', '#9b8fff', '#e05a5a',
            '#5867e8', '#f4bc25', '#e0528d', '#54698d', '#a96517'
        ];
        this._colorOf = new Map();
        this._graph.nodes.forEach(n => {
            this._colorOf.set(n.id, palette[labels.indexOf(n.label) % palette.length] || '#1b96ff');
        });
    }

    _linksForLayout() {
        const useAmt = this._metric === 'amount';
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
        svg.attr('width', this._w).attr('height', this._h)
           .attr('role', 'img')
           .attr('aria-label', 'Sankey flow diagram');

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

        this._drawHeaders(root, result.nodes, iw);
        this._drawLinks(root, result.links);
        this._drawNodes(root, result.nodes);

        this._svg = svg;
        this._applyHighlight();
        /* eslint-enable no-undef */
    }

    _stepLabel(si) {
        return (this._stepLabels && this._stepLabels[si]) || this._steps[si] || '';
    }

    _drawHeaders(root, nodes, chartWidth) {
        const stepInfo = new Map();
        nodes.forEach(n => {
            if (!stepInfo.has(n.stepIndex)) {
                stepInfo.set(n.stepIndex, { x0: n.x0, x1: n.x1 });
            }
        });
        const maxStep = Math.max(...stepInfo.keys());
        const g = root.append('g').attr('class', 'step-headers');
        stepInfo.forEach(({ x0, x1 }, si) => {
            let anchor = 'middle';
            let x = (x0 + x1) / 2;
            if (si === 0)        { anchor = 'start'; x = x0; }
            else if (si === maxStep) { anchor = 'end';   x = x1; }
            g.append('text')
                .attr('x', x).attr('y', -12)
                .attr('text-anchor', anchor)
                .attr('class', 'step-header')
                .text(this._stepLabel(si));
        });

        const headers = g.selectAll('.step-header');
        const maxHeaderW = this._measureMaxWidth(headers);
        if (maxHeaderW > 0) {
            this._wrapText(headers, maxHeaderW * 0.5, 1.2);
        }

        g.append('line')
            .attr('x1', 0).attr('y1', -2)
            .attr('x2', chartWidth).attr('y2', -2)
            .attr('class', 'header-rule');
    }

    _updateHeaderText() {
        if (!this._svg) return;
        /* eslint-disable no-undef */
        const self = this;
        const headers = this._svg.selectAll('.step-header');
        headers.each(function(d, i) {
            d3.select(this).text(self._stepLabel(i));
        });
        const maxW = this._measureMaxWidth(headers);
        if (maxW > 0) {
            this._wrapText(headers, maxW * 0.5, 1.2);
        }
        /* eslint-enable no-undef */
    }

    _drawLinks(root, links) {
        /* eslint-disable no-undef */
        this._gLinks = root.append('g').attr('class', 'g-links');
        this._gLinks.selectAll('path')
            .data(links, l => l.key)
            .join('path')
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('class', 'sankey-link')
            .attr('stroke', l => this._colorOf.get(l.source.id) || '#90d0fe')
            .attr('stroke-width', l => Math.max(1, l.width))
            .attr('stroke-opacity', BASE_OPACITY)
            .on('mouseover', (ev, d) => this._onLinkOver(ev, d))
            .on('mouseout', () => this._onOut());

        this._gOverlay = root.append('g').attr('class', 'g-overlay');
        /* eslint-enable no-undef */
    }

    _drawNodes(root, nodes) {
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
            .attr('fill', n => this._colorOf.get(n.id) || '#1b96ff')
            .attr('rx', 3).attr('ry', 3)
            .attr('class', 'node-rect');

        ng.append('text')
            .attr('x', n => (n.x1 - n.x0) + 6)
            .attr('y', n => (n.y1 - n.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'start')
            .attr('class', 'node-label')
            .text(n => n.label);

        const nodeLabels = ng.select('.node-label');
        const maxNodeW = this._measureMaxWidth(nodeLabels);
        if (maxNodeW > 0) {
            this._wrapText(nodeLabels, maxNodeW * 0.5, 1.2);
        }

        ng.each(function(d) {
            d3.select(this).attr('aria-label', d.label); // eslint-disable-line no-undef
        });
    }

    /* ═══ Highlighting ═════════════════════════════════════════════ */

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
        if (this._mode === 'RECORD_TRACE' && this._selectedRecordId) {
            this._drawOverlay();
        }
    }

    _activeRecordSet() {
        if (this._mode === 'RECORD_TRACE' && this._selectedRecordId) {
            const ri = this._records.findIndex(r => r.id === this._selectedRecordId);
            return ri >= 0 ? new Set([ri]) : null;
        }
        if (this._mode === 'FLOW_TRACE' && this._flowTraceValue && this._flowStepIdx !== '') {
            const nid = this._flowStepIdx + '::' + this._flowTraceValue;
            const node = this._graph.nodeMap.get(nid);
            return node ? new Set(node.recordIndices) : null;
        }
        return null;
    }

    _drawOverlay() {
        /* eslint-disable no-undef */
        const ri = this._records.findIndex(r => r.id === this._selectedRecordId);
        if (ri < 0 || !this._laid) return;

        const rec = this._records[ri];
        const keys = [];
        const limit = this._traceStep;

        for (let i = 0; i < this._steps.length - 1 && i <= limit; i++) {
            const sv = rec[this._steps[i]]     || '\u2205';
            const tv = rec[this._steps[i + 1]] || '\u2205';
            keys.push(i + '::' + sv + '\u2192' + (i + 1) + '::' + tv);
        }

        const keySet = new Set(keys);
        const hits = this._laid.links.filter(l => keySet.has(l.key));

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
        if (this._mode === 'AGGREGATE') {
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

        this._showTip(event,
            d.label + '  (' + this._stepLabel(d.stepIndex) + ')',
            this._countLabel(d.recordIndices),
            ''
        );
    }

    _onLinkOver(event, d) {
        if (this._mode === 'AGGREGATE') {
            d3.select(event.currentTarget) // eslint-disable-line no-undef
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

    /* ═══ Text wrapping ════════════════════════════════════════════ */

    _measureMaxWidth(textSel) {
        let maxW = 0;
        textSel.each(function() {
            const w = this.getComputedTextLength();
            if (w > maxW) maxW = w;
        });
        return maxW;
    }

    _wrapText(textSel, maxWidth, lineHeightEm) {
        /* eslint-disable no-undef */
        textSel.each(function() {
            const textEl = d3.select(this);
            const fullText = textEl.text();
            const words = fullText.split(/\s+/).filter(w => w);
            if (words.length <= 1) return;

            const x = textEl.attr('x');
            const anchor = textEl.attr('text-anchor') || 'start';

            textEl.text(null);

            let line = [];
            let lineCount = 0;
            let tspan = textEl.append('tspan').attr('x', x).attr('text-anchor', anchor);

            for (const word of words) {
                line.push(word);
                tspan.text(line.join(' '));
                if (tspan.node().getComputedTextLength() > maxWidth && line.length > 1) {
                    line.pop();
                    tspan.text(line.join(' '));
                    line = [word];
                    lineCount++;
                    tspan = textEl.append('tspan')
                        .attr('x', x)
                        .attr('dy', lineHeightEm + 'em')
                        .attr('text-anchor', anchor);
                    tspan.text(word);
                }
            }

            if (lineCount > 0) {
                const offsetEm = -(lineCount * lineHeightEm) / 2;
                textEl.select('tspan').attr('dy', offsetEm + 'em');
            }
        });
        /* eslint-enable no-undef */
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
            for (const i of idxSet) s += (this._records[i] ? (this._records[i].amount || 0) : 0);
        }
        return s;
    }

    _countLabel(idxSet) {
        const c = idxSet ? idxSet.size : 0;
        const a = this._sumAmount(idxSet);
        const totalRecs = this._records.length;
        const pct = totalRecs > 0 ? ((c / totalRecs) * 100).toFixed(1) : '0.0';
        return c + ' records  \u00b7  $' + this._fmt(a) + '  \u00b7  ' + pct + '% of total';
    }

    _sampleNames(idxSet, max) {
        if (!idxSet || idxSet.size === 0) return '';
        const arr  = [...idxSet].slice(0, max).map(i => this._records[i] ? this._records[i].name : '');
        const rest = idxSet.size - arr.length;
        return arr.join(', ') + (rest > 0 ? ' +' + rest + ' more' : '');
    }

    _fmt(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
        return String(n);
    }
}
