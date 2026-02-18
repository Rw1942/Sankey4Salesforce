import { LightningElement, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import D3 from '@salesforce/resourceUrl/d3';
import getSankeyData from '@salesforce/apex/SankeyDataController.getSankeyData';

// Sample static data used when no Apex data is available (POC phase)
const SAMPLE_DATA = {
    nodes: [
        { id: 'Lead',        label: 'Lead' },
        { id: 'Qualified',   label: 'Qualified' },
        { id: 'Proposal',    label: 'Proposal' },
        { id: 'Negotiation', label: 'Negotiation' },
        { id: 'ClosedWon',   label: 'Closed Won' },
        { id: 'ClosedLost',  label: 'Closed Lost' }
    ],
    links: [
        { source: 'Lead',        target: 'Qualified',   value: 120 },
        { source: 'Lead',        target: 'ClosedLost',  value: 30  },
        { source: 'Qualified',   target: 'Proposal',    value: 80  },
        { source: 'Qualified',   target: 'ClosedLost',  value: 40  },
        { source: 'Proposal',    target: 'Negotiation', value: 55  },
        { source: 'Proposal',    target: 'ClosedLost',  value: 25  },
        { source: 'Negotiation', target: 'ClosedWon',   value: 45  },
        { source: 'Negotiation', target: 'ClosedLost',  value: 10  }
    ]
};

export default class SankeyExplorer extends LightningElement {
    @track selectedRecordId = null;
    @track recordOptions = [];
    @track isLoading = true;
    @track errorMessage = null;
    @track traceStep = 0;

    _initialized = false;
    _sankeyData = null;
    _resizeObserver = null;
    _svg = null;
    _width = 800;
    _height = 500;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    renderedCallback() {
        if (this._initialized) return;
        this._initialized = true;

        loadScript(this, D3 + '/d3.min.js')
            .then(() => this._loadData())
            .catch(err => {
                this.isLoading = false;
                this.errorMessage = 'Failed to load D3 library: ' + err.message;
            });
    }

    disconnectedCallback() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        }
    }

    // ── Data ─────────────────────────────────────────────────────────────────

    _loadData() {
        getSankeyData()
            .then(result => {
                this._sankeyData = result ? JSON.parse(result) : SAMPLE_DATA;
                this._buildRecordOptions();
                this.isLoading = false;
                this._initChart();
            })
            .catch(() => {
                // Fall back to sample data if Apex is not wired yet
                this._sankeyData = SAMPLE_DATA;
                this._buildRecordOptions();
                this.isLoading = false;
                this._initChart();
            });
    }

    _buildRecordOptions() {
        const records = (this._sankeyData.records || []);
        this.recordOptions = records.map(r => ({ label: r.name, value: r.id }));
    }

    // ── Chart ─────────────────────────────────────────────────────────────────

    _initChart() {
        const container = this.template.querySelector('.chart-container');
        if (!container) return;

        this._resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width } = entry.contentRect;
                if (width > 0) {
                    this._width = width;
                    this._height = Math.max(400, Math.round(width * 0.6));
                    this._drawSankey();
                }
            }
        });
        this._resizeObserver.observe(container);
    }

    _drawSankey() {
        if (!window.d3 || !this._sankeyData) return;

        const svg = d3.select(this.template.querySelector('svg.sankey'));
        svg.selectAll('*').remove();

        const margin = { top: 20, right: 20, bottom: 20, left: 20 };
        const innerW = this._width - margin.left - margin.right;
        const innerH = this._height - margin.top - margin.bottom;

        svg.attr('width', this._width).attr('height', this._height);
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        if (!d3.sankey) {
            // d3-sankey may not be bundled in the base d3 build — show placeholder
            g.append('text')
                .attr('x', innerW / 2).attr('y', innerH / 2)
                .attr('text-anchor', 'middle')
                .attr('class', 'placeholder-text')
                .text('Add d3-sankey to d3.zip to render the diagram.');
            return;
        }

        const sankeyLayout = d3.sankey()
            .nodeId(d => d.id)
            .nodeWidth(18)
            .nodePadding(12)
            .extent([[0, 0], [innerW, innerH]]);

        const { nodes, links } = sankeyLayout({
            nodes: this._sankeyData.nodes.map(d => ({ ...d })),
            links: this._sankeyData.links.map(d => ({ ...d }))
        });

        // Links
        g.append('g').attr('class', 'links')
            .selectAll('path')
            .data(links)
            .join('path')
            .attr('class', d => this._linkClass(d))
            .attr('d', d3.sankeyLinkHorizontal())
            .attr('stroke-width', d => Math.max(1, d.width))
            .on('mouseover', (event, d) => this._handleLinkHover(d, true))
            .on('mouseout',  (event, d) => this._handleLinkHover(d, false));

        // Nodes
        const nodeG = g.append('g').attr('class', 'nodes')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('transform', d => `translate(${d.x0},${d.y0})`);

        nodeG.append('rect')
            .attr('height', d => d.y1 - d.y0)
            .attr('width',  d => d.x1 - d.x0)
            .attr('class', 'node-rect');

        nodeG.append('text')
            .attr('x', d => (d.x0 < innerW / 2) ? (d.x1 - d.x0) + 6 : -6)
            .attr('y', d => (d.y1 - d.y0) / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', d => (d.x0 < innerW / 2) ? 'start' : 'end')
            .attr('class', 'node-label')
            .text(d => d.label || d.id);

        this._svg = svg;
    }

    _linkClass(d) {
        const classes = ['sankey-link'];
        if (this.selectedRecordId) {
            classes.push(this._isLinkInTrace(d) ? 'link--active' : 'link--dim');
        }
        return classes.join(' ');
    }

    _isLinkInTrace(link) {
        if (!this._sankeyData || !this.selectedRecordId) return false;
        const record = (this._sankeyData.records || []).find(r => r.id === this.selectedRecordId);
        if (!record || !record.path) return false;
        const pathLinks = record.path.slice(0, this.traceStep + 1);
        return pathLinks.some(p => p.source === link.source.id && p.target === link.target.id);
    }

    _handleLinkHover(d, isOver) {
        // Extend with tooltip logic as needed
    }

    _refreshLinkClasses() {
        if (!this._svg) return;
        this._svg.selectAll('.sankey-link')
            .attr('class', d => this._linkClass(d));
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    handleRecordChange(event) {
        this.selectedRecordId = event.detail.value;
        this.traceStep = 0;
        this._refreshLinkClasses();
    }

    handleTraceNext() {
        const max = this._maxTraceSteps();
        if (this.traceStep < max) {
            this.traceStep += 1;
            this._refreshLinkClasses();
        }
    }

    handleTracePrev() {
        if (this.traceStep > 0) {
            this.traceStep -= 1;
            this._refreshLinkClasses();
        }
    }

    handleTraceReset() {
        this.traceStep = 0;
        this._refreshLinkClasses();
    }

    _maxTraceSteps() {
        if (!this.selectedRecordId || !this._sankeyData) return 0;
        const record = (this._sankeyData.records || []).find(r => r.id === this.selectedRecordId);
        return record && record.path ? record.path.length - 1 : 0;
    }

    get traceStepLabel() {
        const max = this._maxTraceSteps();
        return `Step ${this.traceStep} / ${max}`;
    }
}
