/**
 * Pure helper functions for building insight-panel context objects.
 * Extracted from dsSankeyBuilder to keep the orchestrator focused on state + events.
 * Every function is stateless — all inputs are explicit parameters.
 */
import { formatNumber, formatPercent } from 'c/dsUtils';

/* ═══ Public builders ═════════════════════════════════════════════════ */

export function buildOverviewInsight(state, stepLabels, fieldLabelMap, objectLabel, isTruncated) {
    const totalRecords = state.data.records.length;
    const coverage = computeStepCoverage(state.data.records, state.data.stepColumns, stepLabels);
    const drop = largestDrop(coverage);
    const topPaths = decoratePaths(state.data.topPaths, totalRecords, state.config, fieldLabelMap);
    const cards = [
        { id: 'records', label: 'Records analyzed', value: formatNumber(totalRecords) },
        { id: 'steps', label: 'Flow steps', value: formatNumber(state.data.stepColumns.length) },
        {
            id: 'completion',
            label: 'Reached last step',
            value: formatPercent(state.data.kpis ? state.data.kpis.conversionRate : 0),
            detail: coverage.length ? coverage[coverage.length - 1].label : ''
        }
    ];

    const mLabel = metricLabel(state.config, fieldLabelMap);
    if (state.config.metricType === 'AMOUNT') {
        cards.push({
            id: 'metricTotal',
            label: 'Total ' + mLabel,
            value: formatNumber(state.data.kpis ? state.data.kpis.totalAmount : 0, 1)
        });
    } else {
        cards.push({
            id: 'largestDrop',
            label: 'Largest drop-off',
            value: drop ? drop.pctLabel : '0%'
        });
    }

    const standout = [];
    if (topPaths.length > 0) {
        standout.push({
            id: 'commonPath',
            title: 'Most common path',
            detail: topPaths[0].path + ' · ' + topPaths[0].metricLabel + ' · ' + topPaths[0].shareLabel
        });
    }
    if (drop) {
        standout.push({
            id: 'largestDrop',
            title: 'Biggest drop-off',
            detail: drop.fromLabel + ' to ' + drop.toLabel + ' drops ' + drop.countLabel + ' (' + drop.pctLabel + ')'
        });
    }

    const convRate = formatPercent(state.data.kpis ? state.data.kpis.conversionRate : 0);
    const summary = topPaths.length > 0
        ? 'Most records follow "' + topPaths[0].path + '", while only ' + convRate + ' reach the final step.'
        : 'This view summarizes how records move across the selected steps.';

    return {
        modeLabel: 'Overview',
        title: 'At a glance',
        summary,
        pills: commonPills(state.config, objectLabel, fieldLabelMap),
        cards,
        standout,
        pathSectionTitle: 'Top paths',
        pathRows: topPaths,
        storySteps: [],
        nextSteps: overviewNextSteps(topPaths, drop),
        warnings: buildWarnings(state.config, isTruncated),
        showClearFocus: false
    };
}

export function buildFlowInsight(state, stepLabels, fieldLabelMap, objectLabel, isTruncated) {
    const chain = state.ui.flowFocusChain || [];
    const effectiveChain = chain.length > 0
        ? chain
        : [{ stepIndex: parseInt(state.ui.flowStepIdx, 10), label: state.ui.flowTraceValue }];

    const matching = matchingFlowRecords(state);
    const totalRecords = state.data.records.length;
    const sharePct = totalRecords > 0 ? (matching.length / totalRecords) * 100 : 0;
    const lastStepPct = reachedLastStepPct(matching, state.data.stepColumns);

    const tailStep = effectiveChain[effectiveChain.length - 1].stepIndex;
    const headStep = effectiveChain[0].stepIndex;
    const topNext = topNeighbor(matching, tailStep + 1, state.data.stepColumns, stepLabels);
    const topPrev = topNeighbor(matching, headStep - 1, state.data.stepColumns, stepLabels);
    const cohortPaths = topPathsFromRecords(matching, state, fieldLabelMap);

    const chainDescs = effectiveChain.map(({ stepIndex, label }) => {
        const sl = stepLabels[stepIndex] || state.data.stepColumns[stepIndex] || 'Step';
        return sl + ': ' + label;
    });
    const title = chainDescs.join(' \u203a ');

    let summary;
    if (effectiveChain.length === 1) {
        const sl = stepLabels[effectiveChain[0].stepIndex] || state.data.stepColumns[effectiveChain[0].stepIndex] || 'Selected step';
        summary = 'You are looking at records that pass through "' + effectiveChain[0].label + '" at the "' + sl + '" step.';
    } else {
        summary = 'Narrowed to records passing through ' + effectiveChain.length + ' focus points. Click another downstream node to narrow further, or reset to start over.';
    }

    const mLabel = metricLabel(state.config, fieldLabelMap);
    const cards = [
        { id: 'cohortSize', label: 'Records in focus', value: formatNumber(matching.length) },
        { id: 'shareOfTotal', label: 'Share of total', value: formatPercent(sharePct) },
        { id: 'reachedLastStep', label: 'Reached last step', value: formatPercent(lastStepPct) }
    ];
    if (state.config.metricType === 'AMOUNT') {
        cards.push({
            id: 'cohortMetricTotal',
            label: 'Total ' + mLabel,
            value: formatNumber(sumAmount(matching), 1)
        });
    }

    const standout = [];
    if (topPrev) {
        standout.push({
            id: 'topPrev',
            title: 'Most common source',
            detail: topPrev.stepLabel + ': ' + topPrev.value + ' · ' + formatPercent(topPrev.sharePct) + ' of this group'
        });
    }
    if (topNext) {
        standout.push({
            id: 'topNext',
            title: 'Most common next stop',
            detail: topNext.stepLabel + ': ' + topNext.value + ' · ' + formatPercent(topNext.sharePct) + ' of this group'
        });
    }

    return {
        modeLabel: effectiveChain.length > 1 ? 'Narrowed Group' : 'Focused Group',
        title,
        summary,
        pills: commonPills(state.config, objectLabel, fieldLabelMap).concat(chainDescs),
        cards,
        standout,
        pathSectionTitle: 'Top paths in this group',
        pathRows: cohortPaths,
        storySteps: [],
        nextSteps: [
            'Click a downstream node to keep narrowing this group.',
            'Use Reset Focus above the chart to clear all narrowing and return to the full view.',
            'Switch to Record Trace if you want to inspect one record in detail.'
        ],
        warnings: buildWarnings(state.config, isTruncated),
        showClearFocus: true
    };
}

export function buildRecordInsight(state, stepLabels, fieldLabelMap, objectLabel, isTruncated) {
    const record = state.data.records.find(r => r.id === state.ui.selectedRecord);
    if (!record) {
        return buildOverviewInsight(state, stepLabels, fieldLabelMap, objectLabel, isTruncated);
    }

    const storySteps = state.data.stepColumns
        .map((stepApi, index) => {
            const value = record[stepApi];
            if (value === undefined || value === null || value === '') return null;
            return { id: stepApi, label: stepLabels[index] || stepApi, value };
        })
        .filter(Boolean);

    const fullPath = storySteps.map(s => s.value).join(' -> ');
    const topPathMatch = state.data.topPaths.find(p => p.path === fullPath);
    const mLabel = metricLabel(state.config, fieldLabelMap);

    const totalSteps = Math.max(0, state.data.stepColumns.length - 1);
    const currentStep = totalSteps > 0 ? state.ui.traceStep + 1 : 0;
    const progressLabel = 'Step ' + currentStep + ' of ' + totalSteps;

    const cards = [
        { id: 'storyLength', label: 'Steps mapped', value: formatNumber(storySteps.length) },
        { id: 'traceProgress', label: 'Trace progress', value: progressLabel }
    ];
    if (state.config.metricType === 'AMOUNT') {
        cards.push({ id: 'recordMetric', label: mLabel, value: formatNumber(record.amount || 0, 1) });
    }
    if (topPathMatch) {
        cards.push({ id: 'pathRank', label: 'Path rank', value: '#' + topPathMatch.rank });
    }

    const standout = [
        { id: 'recordPath', title: 'Record path', detail: fullPath || 'This record does not have a complete path yet.' }
    ];
    if (topPathMatch) {
        standout.push({ id: 'commonJourney', title: 'How common this is', detail: 'This exact path is #' + topPathMatch.rank + ' ranked in the current dataset.' });
    } else {
        standout.push({ id: 'rareJourney', title: 'How common this is', detail: 'This exact path is not in the current top ranked paths.' });
    }

    return {
        modeLabel: 'Record Detail',
        title: record.name || record.id,
        summary: 'This view follows one record through the flow so you can compare its path with the broader pattern.',
        pills: commonPills(state.config, objectLabel, fieldLabelMap).concat(['Record Trace']),
        cards,
        standout,
        pathSectionTitle: '',
        pathRows: [],
        storySteps,
        nextSteps: [
            'Use Next and Prev above the chart to animate this record through each transition.',
            'Switch back to Overview to compare this path with the most common paths.'
        ],
        warnings: buildWarnings(state.config, isTruncated),
        showClearFocus: true
    };
}

/* ═══ Flow-record matching (also used by flowTraceKpis) ═══════════════ */

export function matchingFlowRecords(state) {
    const chain = state.ui.flowFocusChain;
    if (chain && chain.length > 0) {
        return state.data.records.filter(record =>
            chain.every(({ stepIndex, label }) => {
                const stepApi = state.data.stepColumns[stepIndex];
                return stepApi && (record[stepApi] || '\u2205') === label;
            })
        );
    }
    const stepIdx = parseInt(state.ui.flowStepIdx, 10);
    const stepApi = state.data.stepColumns[stepIdx];
    if (isNaN(stepIdx) || !stepApi) return [];
    return state.data.records.filter(record => (record[stepApi] || '\u2205') === state.ui.flowTraceValue);
}

/* ═══ Private helpers ═════════════════════════════════════════════════ */

const DATASET_LIMIT = 10000;

function metricLabel(config, fieldLabelMap) {
    if (config.metricType !== 'AMOUNT') return 'Records';
    const apiName = config.metricField;
    return fieldLabelMap[apiName] || apiName || 'selected metric';
}

function commonPills(config, objectLabel, fieldLabelMap) {
    const mLabel = config.metricType === 'AMOUNT'
        ? 'Sum of ' + metricLabel(config, fieldLabelMap)
        : 'Count';
    const filterLabel = config.filters.length > 0
        ? config.filters.length + ' filters'
        : 'No filters';
    return [objectLabel || config.objectApiName || 'Object', mLabel, filterLabel];
}

function buildWarnings(config, isTruncated) {
    const warnings = [];
    if (isTruncated) warnings.push('Results were limited to ' + DATASET_LIMIT + ' records. Apply filters if you need a tighter cohort.');
    if (config.nullHandling === 'GROUP_UNKNOWN') warnings.push('Blank values are grouped as Unknown, which can make some branches look larger.');
    if (config.nullHandling === 'CARRY_FORWARD') warnings.push('Blank values carry forward from the previous step, which smooths the path but can hide gaps.');
    return warnings;
}

function overviewNextSteps(topPaths, drop) {
    const steps = [];
    if (topPaths.length > 0) steps.push('Click a thick node in the chart to focus on a group and see where it goes next.');
    if (drop) steps.push('Inspect the jump from ' + drop.fromLabel + ' to ' + drop.toLabel + ' to understand where records thin out.');
    steps.push('Switch to Record Trace when you want to walk through a single record step by step.');
    return steps;
}

function computeStepCoverage(records, stepColumns, stepLabels) {
    return stepColumns.map((stepApi, index) => {
        const count = records.filter(r => r[stepApi] !== undefined && r[stepApi] !== null && r[stepApi] !== '').length;
        return {
            index,
            label: stepLabels[index] || stepApi,
            count,
            sharePct: records.length > 0 ? (count / records.length) * 100 : 0
        };
    });
}

function largestDrop(coverage) {
    let best = null;
    for (let i = 1; i < coverage.length; i++) {
        const diff = coverage[i - 1].count - coverage[i].count;
        if (diff > 0 && (!best || diff > best.count)) {
            best = {
                count: diff,
                countLabel: formatNumber(diff) + ' records',
                pctLabel: formatPercent(coverage[i - 1].count > 0 ? (diff / coverage[i - 1].count) * 100 : 0),
                fromLabel: coverage[i - 1].label,
                toLabel: coverage[i].label
            };
        }
    }
    return best;
}

function decoratePaths(paths, totalRecords, config, fieldLabelMap) {
    const mLabel = metricLabel(config, fieldLabelMap);
    return (paths || []).map(p => {
        const sharePct = totalRecords > 0 ? (p.count / totalRecords) * 100 : 0;
        const ml = config.metricType === 'AMOUNT'
            ? 'Total ' + mLabel + ': ' + formatNumber(p.amount || 0, 1)
            : p.count + ' records';
        return { id: 'path-' + p.rank, rank: p.rank, path: p.path, metricLabel: ml, shareLabel: formatPercent(sharePct) };
    });
}

function topPathsFromRecords(records, state, fieldLabelMap) {
    const counts = new Map();
    const amounts = new Map();
    for (const record of records) {
        const path = recordPath(record, state.data.stepColumns);
        if (!path) continue;
        counts.set(path, (counts.get(path) || 0) + 1);
        amounts.set(path, (amounts.get(path) || 0) + (record.amount || 0));
    }
    const mLabel = metricLabel(state.config, fieldLabelMap);
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([path, count], index) => ({
            id: 'cohort-path-' + index,
            rank: index + 1,
            path,
            metricLabel: state.config.metricType === 'AMOUNT'
                ? 'Total ' + mLabel + ': ' + formatNumber(amounts.get(path) || 0, 1)
                : count + ' records',
            shareLabel: formatPercent(records.length > 0 ? (count / records.length) * 100 : 0)
        }));
}

function reachedLastStepPct(records, stepColumns) {
    if (records.length === 0 || stepColumns.length === 0) return 0;
    const lastStep = stepColumns[stepColumns.length - 1];
    const reached = records.filter(r => r[lastStep] !== undefined && r[lastStep] !== null && r[lastStep] !== '').length;
    return (reached / records.length) * 100;
}

function topNeighbor(records, stepIdx, stepColumns, stepLabels) {
    if (stepIdx < 0 || stepIdx >= stepColumns.length || records.length === 0) return null;
    const stepApi = stepColumns[stepIdx];
    const counts = new Map();
    for (const record of records) {
        const value = record[stepApi];
        if (value === undefined || value === null || value === '') continue;
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    if (counts.size === 0) return null;
    const topEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
        stepLabel: stepLabels[stepIdx] || stepApi,
        value: topEntry[0],
        sharePct: (topEntry[1] / records.length) * 100
    };
}

function recordPath(record, stepColumns) {
    return stepColumns
        .map(stepApi => record[stepApi])
        .filter(v => v !== undefined && v !== null && v !== '')
        .join(' -> ');
}

function sumAmount(records) {
    return records.reduce((s, r) => s + (r.amount || 0), 0);
}
