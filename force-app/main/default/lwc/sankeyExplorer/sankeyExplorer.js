import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3_RESOURCE from '@salesforce/resourceUrl/d3';

/* ═══════════════════════════════════════════════════════════════════════════
   SAMPLE TABULAR DATA  (POC — replace with Apex wire when ready)
   ═══════════════════════════════════════════════════════════════════════════ */

const STEP_COLS = ['Source', 'Qualification', 'Review', 'Outcome'];

const SAMPLE = [
    { id: 'R001', name: 'Acme Corp Loan',     Source: 'Online',   Qualification: 'Qualified',     Review: 'Auto Review',    Outcome: 'Approved',  amount: 50000  },
    { id: 'R002', name: 'Beta Inc Loan',       Source: 'Online',   Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Approved',  amount: 120000 },
    { id: 'R003', name: 'Gamma LLC Loan',      Source: 'Branch',   Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Declined',  amount: 200000 },
    { id: 'R004', name: 'Delta Partners',      Source: 'Partner',  Qualification: 'Pre-Qualified', Review: 'Committee',      Outcome: 'Approved',  amount: 500000 },
    { id: 'R005', name: 'Epsilon Finance',     Source: 'Online',   Qualification: 'Fast Track',    Review: 'Auto Review',    Outcome: 'Approved',  amount: 30000  },
    { id: 'R006', name: 'Zeta Holdings',       Source: 'Referral', Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Approved',  amount: 175000 },
    { id: 'R007', name: 'Eta Services',        Source: 'Online',   Qualification: 'Qualified',     Review: 'Auto Review',    Outcome: 'Declined',  amount: 45000  },
    { id: 'R008', name: 'Theta Corp',          Source: 'Branch',   Qualification: 'Pre-Qualified', Review: 'Manual Review',  Outcome: 'Approved',  amount: 90000  },
    { id: 'R009', name: 'Iota Group',          Source: 'Partner',  Qualification: 'Qualified',     Review: 'Committee',      Outcome: 'Declined',  amount: 300000 },
    { id: 'R010', name: 'Kappa Systems',       Source: 'Online',   Qualification: 'Fast Track',    Review: 'Auto Review',    Outcome: 'Approved',  amount: 25000  },
    { id: 'R011', name: 'Lambda Tech',         Source: 'Referral', Qualification: 'Qualified',     Review: 'Auto Review',    Outcome: 'Approved',  amount: 60000  },
    { id: 'R012', name: 'Mu Industries',       Source: 'Branch',   Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Withdrawn', amount: 150000 },
    { id: 'R013', name: 'Nu Ventures',         Source: 'Online',   Qualification: 'Pre-Qualified', Review: 'Committee',      Outcome: 'Approved',  amount: 400000 },
    { id: 'R014', name: 'Xi Capital',          Source: 'Partner',  Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Approved',  amount: 220000 },
    { id: 'R015', name: 'Omicron Ltd',         Source: 'Online',   Qualification: 'Qualified',     Review: 'Auto Review',    Outcome: 'Declined',  amount: 35000  },
    { id: 'R016', name: 'Pi Solutions',        Source: 'Referral', Qualification: 'Fast Track',    Review: 'Auto Review',    Outcome: 'Approved',  amount: 40000  },
    { id: 'R017', name: 'Rho Analytics',       Source: 'Branch',   Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Declined',  amount: 110000 },
    { id: 'R018', name: 'Sigma Health',        Source: 'Online',   Qualification: 'Qualified',     Review: 'Manual Review',  Outcome: 'Withdrawn', amount: 85000  },
    { id: 'R019', name: 'Tau Energy',          Source: 'Partner',  Qualification: 'Pre-Qualified', Review: 'Committee',      Outcome: 'Approved',  amount: 350000 },
    { id: 'R020', name: 'Upsilon Foods',       Source: 'Online',   Qualification: 'Qualified',     Review: 'Auto Review',    Outcome: 'Approved',  amount: 55000  }
];

/* ── Layout constants ── */
const MARGIN       = { top: 32, right: 160, bottom: 20, left: 20 };
const NODE_W       = 18;
const NODE_PAD     = 16;
const BASE_OPACITY = 0.35;
const DIM_OPACITY  = 0.07;
const HI_OPACITY   = 0.72;
const OVERLAY_W    = 4;
const ANIM_MS      = 250;

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default class SankeyExplorer extends LightningElement {

    /* ── Reactive state (LWC auto-tracks primitives; @track not needed) ─ */
    mode            = 'AGGREGATE';
    metric          = 'count';
    selectedRecordId = '';
    flowStepIdx     = '';
    flowTraceValue  = '';
    traceStep       = 0;
    isLoading       = true;
    errorMessage    = '';

    tooltipVisible = false;
    tooltipTitle   = '';
    tooltipDetail  = '';
    tooltipExtra   = '';
    tooltipX       = 0;
    tooltipY       = 0;

    /* ── Private ───────────────────────────────────────────────────────── */
    _init      = false;
    _records   = [];
    _steps     = [];
    _graph     = null;   // { nodes[], nodeMap, linkAgg }
    _laid      = null;   // post-layout { nodes, links }
    _svg       = null;
    _gLinks    = null;
    _gOverlay  = null;
    _gNodes    = null;
    _colorOf   = null;   // Map<nodeId, color>
    _w         = 960;
    _h         = 540;
    _ro        = null;
    _rafId     = null;  // requestAnimationFrame handle for resize debounce

    // Tracks the currently click-selected node id or link key.
    // Decoupled from the mode dropdown so click-to-highlight works in
    // any mode and toggles off on a second click (EPIC 6 — Flow Trace).
    _clickedId = null;

    /* ═══ Lifecycle ════════════════════════════════════════════════════ */

    renderedCallback() {
        if (this._init) return;
        this._init = true;

        loadScript(this, D3_RESOURCE + '/d3.min.js')
            .then(() => {
                this._records = SAMPLE;
                this._steps   = STEP_COLS;
                this.isLoading = false;
                this._setup();
            })
            .catch(e => {
                this.isLoading = false;
                this.errorMessage = 'D3 load error: ' + (e.message || e);
            });
    }

    disconnectedCallback() {
        if (this._ro)    this._ro.disconnect();
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }

    /* ═══ Template getters ═════════════════════════════════════════════ */

    get modeOptions() {
        return [
            { label: 'Aggregated',   value: 'AGGREGATE'    },
            { label: 'Record Trace', value: 'RECORD_TRACE' },
            { label: 'Flow Trace',   value: 'FLOW_TRACE'   }
        ];
    }

    get metricOptions() {
        return [
            { label: 'Count',  value: 'count'  },
            { label: 'Amount', value: 'amount' }
        ];
    }

    get recordOptions() {
        return this._records.map(r => ({
            label: r.name + ' (' + r.id + ')',
            value: r.id
        }));
    }

    get flowStepOptions() {
        return this._steps.map((s, i) => ({ label: s, value: String(i) }));
    }

    get flowValueOptions() {
        const idx = parseInt(this.flowStepIdx, 10);
        if (isNaN(idx) || idx < 0 || idx >= this._steps.length) return [];
        const col = this._steps[idx];
        const vals = [...new Set(this._records.map(r => r[col] || '\u2205'))].sort();
        return vals.map(v => ({ label: v, value: v }));
    }

    get isRecordTrace()    { return this.mode === 'RECORD_TRACE'; }
    get isFlowTrace()      { return this.mode === 'FLOW_TRACE'; }
    get showTraceControls(){ return this.isRecordTrace && !!this.selectedRecordId; }

    get traceStepLabel() {
        return 'Step ' + this.traceStep + ' / ' + this._maxTrace();
    }

    get tooltipClass() {
        return 'sankey-tooltip' + (this.tooltipVisible ? ' visible' : '');
    }

    get tooltipStyle() {
        return 'left:' + this.tooltipX + 'px;top:' + this.tooltipY + 'px';
    }

    /* ═══ Graph construction ═══════════════════════════════════════════ */

    _buildGraph() {
        const steps   = this._steps;
        const records = this._records;
        const nodes   = [];
        const nodeMap = new Map();
        const linkAgg = new Map();

        steps.forEach((col, si) => {
            const seen = new Set();
            records.forEach((rec, ri) => {
                const val = rec[col] || '\u2205';
                const nid = si + '::' + val;
                if (!seen.has(nid)) {
                    seen.add(nid);
                    nodeMap.set(nid, {
                        id: nid, stepIndex: si, label: val,
                        recordIndices: new Set()
                    });
                    nodes.push(nodeMap.get(nid));
                }
                nodeMap.get(nid).recordIndices.add(ri);
            });
        });

        records.forEach((rec, ri) => {
            for (let i = 0; i < steps.length - 1; i++) {
                const sv  = rec[steps[i]]     || '\u2205';
                const tv  = rec[steps[i + 1]] || '\u2205';
                const sid = i + '::' + sv;
                const tid = (i + 1) + '::' + tv;
                const key = sid + '\u2192' + tid;

                if (!linkAgg.has(key)) {
                    linkAgg.set(key, {
                        source: sid, target: tid, key: key,
                        recordIndices: new Set(),
                        countVal: 0, amountVal: 0
                    });
                }
                const lnk = linkAgg.get(key);
                lnk.recordIndices.add(ri);
                lnk.countVal  += 1;
                lnk.amountVal += (rec.amount || 0);
            }
        });

        this._graph = { nodes, nodeMap, linkAgg };
    }

    _linksForLayout() {
        const useAmt = this.metric === 'amount';
        return Array.from(this._graph.linkAgg.values()).map(l => ({
            source: l.source,
            target: l.target,
            value:  useAmt ? l.amountVal : l.countVal,
            key:    l.key,
            recordIndices: l.recordIndices,
            countVal:  l.countVal,
            amountVal: l.amountVal
        }));
    }

    /* ═══ Init ═════════════════════════════════════════════════════════ */

    _setup() {
        this._buildGraph();

        const labels = [...new Set(this._graph.nodes.map(n => n.label))];
        // eslint-disable-next-line no-undef
        const palette = d3.schemeTableau10;
        this._colorOf = new Map();
        this._graph.nodes.forEach(n => {
            this._colorOf.set(n.id, palette[labels.indexOf(n.label) % palette.length]);
        });

        const ctr = this.template.querySelector('.chart-container');
        if (!ctr) return;

        // Debounce resize via rAF to avoid dozens of full SVG rebuilds
        // during a drag-resize.  Only the last frame actually redraws.
        this._ro = new ResizeObserver(() => {
            if (this._rafId) cancelAnimationFrame(this._rafId);
            this._rafId = requestAnimationFrame(() => this._onResize());
        });
        this._ro.observe(ctr);
    }

    _onResize() {
        const ctr = this.template.querySelector('.chart-container');
        if (!ctr || ctr.clientWidth <= 0) return;
        this._w = ctr.clientWidth;
        this._h = Math.max(440, Math.round(this._w * 0.55));
        this._draw();
    }

    /* ═══ Drawing ══════════════════════════════════════════════════════ */

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
                .text('d3-sankey not found — rebuild d3.zip with d3-sankey bundled.');
            return;
        }

        // Invisible rect behind all elements — clicking empty space deselects
        root.append('rect')
            .attr('width', iw).attr('height', ih)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('click', () => {
                if (this._clickedId) {
                    this._clickedId = null;
                    this._applyHighlight();
                }
            });

        const nodesCopy = this._graph.nodes.map(n => Object.assign({}, n));
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
                .text(this._steps[si]);
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
            .on('mouseout',  ()      => this._onOut())
            .on('click',     (ev, d) => this._onLinkClick(d));

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
            .on('mouseout',  ()      => this._onOut())
            .on('click',     (ev, d) => this._onNodeClick(d));

        ng.append('rect')
            .attr('width',  n => n.x1 - n.x0)
            .attr('height', n => Math.max(1, n.y1 - n.y0))
            .attr('fill',   n => this._colorOf.get(n.id) || '#1b5faa')
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

    /* ═══ Highlighting ═════════════════════════════════════════════════ */

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

    /**
     * Returns the Set of record indices that should be highlighted,
     * or null when everything should render at base opacity.
     *
     * Priority order:
     *  1. Click selection (_clickedId)  — ad-hoc highlight in any mode
     *  2. Mode-based selection          — RECORD_TRACE / FLOW_TRACE dropdowns
     *  3. null                          — no active highlight (AGGREGATE default)
     */
    _activeRecordSet() {
        if (this._clickedId) {
            return this._clickedRecordSet();
        }
        if (this.mode === 'RECORD_TRACE' && this.selectedRecordId) {
            const ri = this._records.findIndex(r => r.id === this.selectedRecordId);
            return ri >= 0 ? new Set([ri]) : null;
        }
        if (this.mode === 'FLOW_TRACE' && this.flowTraceValue && this.flowStepIdx !== '') {
            const nid  = this.flowStepIdx + '::' + this.flowTraceValue;
            const node = this._graph.nodeMap.get(nid);
            return node ? new Set(node.recordIndices) : null;
        }
        return null;
    }

    /**
     * Resolves _clickedId to a record-index Set.
     * _clickedId may be a node id (e.g. "0::Online") or a link key
     * (e.g. "0::Online→1::Qualified").  The returned set contains every
     * record that passes through the element, which naturally lights up
     * the full upstream + downstream path (EPIC 6 acceptance criteria).
     */
    _clickedRecordSet() {
        const node = this._graph.nodeMap.get(this._clickedId);
        if (node) return new Set(node.recordIndices);

        const link = this._graph.linkAgg.get(this._clickedId);
        if (link) return new Set(link.recordIndices);

        return null;
    }

    _drawOverlay() {
        /* eslint-disable no-undef */
        const ri  = this._records.findIndex(r => r.id === this.selectedRecordId);
        if (ri < 0 || !this._laid) return;

        const rec = this._records[ri];
        const keys = [];
        const limit = this.traceStep;

        for (let i = 0; i < this._steps.length - 1 && i <= limit; i++) {
            const sv = rec[this._steps[i]]     || '\u2205';
            const tv = rec[this._steps[i + 1]] || '\u2205';
            keys.push(i + '::' + sv + '\u2192' + (i + 1) + '::' + tv);
        }

        const keySet = new Set(keys);
        const hits   = this._laid.links.filter(l => keySet.has(l.key));

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

    /* ═══ Hover / click ════════════════════════════════════════════════ */

    /**
     * Hover preview — shows connected links/nodes and a tooltip.
     * Skipped when a click selection is active so the persistent
     * highlight is not overridden by transient hover effects.
     */
    _onNodeOver(event, d) {
        if (!this._clickedId) {
            this._gLinks.selectAll('path')
                .transition().duration(120)
                .attr('stroke-opacity', l =>
                    (l.source.id === d.id || l.target.id === d.id)
                        ? HI_OPACITY : DIM_OPACITY
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

        this._showTip(event, d.label + '  (' + this._steps[d.stepIndex] + ')',
            this._countLabel(d.recordIndices), '');
    }

    _onLinkOver(event, d) {
        if (!this._clickedId) {
            // eslint-disable-next-line no-undef
            d3.select(event.currentTarget)
                .transition().duration(120)
                .attr('stroke-opacity', 0.75);
        }

        const src = d.source.label || d.source.id;
        const tgt = d.target.label || d.target.id;
        this._showTip(event, src + ' \u2192 ' + tgt,
            this._countLabel(d.recordIndices),
            this._sampleNames(d.recordIndices, 3));
    }

    _onOut() {
        this.tooltipVisible = false;
        this._applyHighlight();
    }

    /**
     * Toggle click-based highlight on a node (EPIC 6 — Flow Trace).
     * Clicking the same node again deselects it; clicking a different
     * element switches the selection.  Does NOT mutate the mode dropdown
     * so the user's chosen view mode stays intact.
     */
    _onNodeClick(d) {
        this._clickedId = (this._clickedId === d.id) ? null : d.id;
        this._applyHighlight();
    }

    /**
     * Toggle click-based highlight on a link.
     * Same toggle semantics as node click — uses the link's unique key
     * so the full upstream/downstream path through that transition lights up.
     */
    _onLinkClick(d) {
        this._clickedId = (this._clickedId === d.key) ? null : d.key;
        this._applyHighlight();
    }

    _showTip(event, title, detail, extra) {
        const box = this.template.querySelector('.chart-container').getBoundingClientRect();
        this.tooltipTitle  = title;
        this.tooltipDetail = detail;
        this.tooltipExtra  = extra;

        // Clamp so the tooltip stays inside the visible chart area
        const rawX = event.clientX - box.left + 14;
        const rawY = event.clientY - box.top  - 30;
        const tipW = 280; // matches max-width in CSS
        const tipH = 70;
        this.tooltipX = Math.min(rawX, box.width  - tipW - 8);
        this.tooltipY = Math.max(8, Math.min(rawY, box.height - tipH - 8));
        this.tooltipVisible = true;
    }

    /* ═══ Event handlers ═══════════════════════════════════════════════ */

    handleModeChange(event) {
        this.mode = event.detail.value;
        this._clickedId = null;
        if (this.mode !== 'RECORD_TRACE') { this.selectedRecordId = ''; this.traceStep = 0; }
        if (this.mode !== 'FLOW_TRACE')   { this.flowStepIdx = ''; this.flowTraceValue = ''; }
        this._applyHighlight();
    }

    handleMetricChange(event) {
        this.metric = event.detail.value;
        this._clickedId = null;
        this._draw();
    }

    handleRecordChange(event) {
        this.selectedRecordId = event.detail.value;
        this._clickedId = null;
        this.traceStep = this._maxTrace();
        this._applyHighlight();
    }

    handleFlowStepChange(event) {
        this.flowStepIdx    = event.detail.value;
        this.flowTraceValue = '';
        this._clickedId = null;
        this._applyHighlight();
    }

    handleFlowValueChange(event) {
        this.flowTraceValue = event.detail.value;
        this._clickedId = null;
        this._applyHighlight();
    }

    handleTraceNext() {
        if (this.traceStep < this._maxTrace()) {
            this.traceStep += 1;
            this._applyHighlight();
        }
    }

    handleTracePrev() {
        if (this.traceStep > 0) {
            this.traceStep -= 1;
            this._applyHighlight();
        }
    }

    handleTraceReset() {
        this.traceStep = 0;
        this._applyHighlight();
    }

    handleResetAll() {
        this.mode              = 'AGGREGATE';
        this.metric            = 'count';
        this.selectedRecordId  = '';
        this.flowStepIdx       = '';
        this.flowTraceValue    = '';
        this.traceStep         = 0;
        this._clickedId        = null;
        this._draw();
    }

    /* ═══ Utilities ════════════════════════════════════════════════════ */

    _maxTrace() {
        return this.selectedRecordId ? this._steps.length - 2 : 0;
    }

    _intersects(setA, setB) {
        for (const v of setB) {
            if (setA.has(v)) return true;
        }
        return false;
    }

    _sumAmount(idxSet) {
        let s = 0;
        if (idxSet) {
            for (const i of idxSet) s += (this._records[i].amount || 0);
        }
        return s;
    }

    _countLabel(idxSet) {
        const c     = idxSet ? idxSet.size : 0;
        const total = this._records.length;
        const pct   = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0';
        const a     = this._sumAmount(idxSet);
        return c + ' records  \u00b7  ' + pct + '%  \u00b7  $' + this._fmt(a);
    }

    _sampleNames(idxSet, max) {
        if (!idxSet || idxSet.size === 0) return '';
        const arr  = [...idxSet].slice(0, max).map(i => this._records[i].name);
        const rest = idxSet.size - arr.length;
        return arr.join(', ') + (rest > 0 ? ' +' + rest + ' more' : '');
    }

    _fmt(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
        return String(n);
    }
}
