/**
 * Section 6.2 — Path aggregation algorithm + KPI computation.
 * Story 3.2 — Null handling modes (STOP, GROUP_UNKNOWN, CARRY_FORWARD).
 * Story 7.1/7.2 — Guided insights: drop-off, conversion, top paths, avg amount.
 *
 * For each record, builds transitions (step_i -> step_{i+1}) += metric,
 * stored as Map<PathKey, Decimal>. Returns D3-ready nodes + links + KPIs.
 */
public with sharing class SankeyService {

    private static final String UNKNOWN_LABEL = 'Unknown';

    /**
     * Section 6.2 + 6.3: Build the full Sankey response from raw SObject records.
     * Returns a JSON-serializable map with nodes, links, records, stepColumns, kpis, topPaths.
     */
    public static Map<String, Object> buildSankeyResponse(
        List<SObject> rawRecords,
        Map<String, Object> config
    ) {
        List<Object> pathFieldsRaw = (List<Object>) config.get('pathFields');
        List<String> pathFields = new List<String>();
        for (Object pf : pathFieldsRaw) {
            pathFields.add((String) pf);
        }

        String metricType = (String) config.get('metricType');
        String metricField = (String) config.get('metricField');
        String recordIdField = (String) config.get('recordIdField');
        String nullHandling = (String) config.get('nullHandling');

        // Section 6.2: Build tabular records and aggregate transitions
        List<Map<String, Object>> records = new List<Map<String, Object>>();
        Map<String, Map<String, Object>> nodeMap = new Map<String, Map<String, Object>>();
        Map<String, Map<String, Object>> linkAgg = new Map<String, Map<String, Object>>();

        // Track per-step record counts for drop-off computation (Story 7.1)
        Map<Integer, Integer> stepRecordCounts = new Map<Integer, Integer>();
        // Track full paths for top-paths computation (Story 7.2)
        Map<String, Integer> fullPathCounts = new Map<String, Integer>();
        Map<String, Decimal> fullPathAmounts = new Map<String, Decimal>();

        Decimal totalAmount = 0;
        Integer totalRecords = rawRecords.size();

        for (SObject rec : rawRecords) {
            Map<String, Object> row = new Map<String, Object>();
            String recId = String.valueOf(rec.get(recordIdField != null ? recordIdField : 'Id'));
            row.put('id', recId);
            row.put('name', String.valueOf(rec.get('Name')));

            Decimal amount = 0;
            if (metricType == 'AMOUNT' && String.isNotBlank(metricField)) {
                Object amtObj = rec.get(metricField);
                if (amtObj != null) {
                    amount = (Decimal) amtObj;
                }
            }
            row.put('amount', amount);
            totalAmount += amount;

            // Story 3.2: Apply null handling and build path values
            List<String> pathValues = new List<String>();
            String lastValue = null;
            Boolean stopped = false;

            for (Integer si = 0; si < pathFields.size(); si++) {
                String col = pathFields[si];
                Object rawVal = rec.get(col);
                String val;

                if (rawVal == null || String.isBlank(String.valueOf(rawVal))) {
                    // Story 3.2: Null handling strategy
                    if (nullHandling == 'STOP') {
                        stopped = true;
                        break;
                    } else if (nullHandling == 'CARRY_FORWARD') {
                        val = lastValue != null ? lastValue : UNKNOWN_LABEL;
                    } else {
                        val = UNKNOWN_LABEL;
                    }
                } else {
                    val = String.valueOf(rawVal);
                }

                lastValue = val;
                pathValues.add(val);
                row.put(col, val);

                // Story 7.1: Count records per step
                Integer sc = stepRecordCounts.containsKey(si) ? stepRecordCounts.get(si) : 0;
                stepRecordCounts.put(si, sc + 1);

                // Build node
                String nid = si + '::' + val;
                if (!nodeMap.containsKey(nid)) {
                    nodeMap.put(nid, new Map<String, Object>{
                        'id' => nid,
                        'label' => val,
                        'stepIndex' => si,
                        'columnName' => col
                    });
                }
            }

            // Section 6.2: Build transitions for non-stopped paths
            if (!stopped) {
                for (Integer i = 0; i < pathValues.size() - 1; i++) {
                    String sv = pathValues[i];
                    String tv = pathValues[i + 1];
                    String sid = i + '::' + sv;
                    String tid = (i + 1) + '::' + tv;
                    String key = sid + '\u2192' + tid;

                    if (!linkAgg.containsKey(key)) {
                        linkAgg.put(key, new Map<String, Object>{
                            'source' => sid,
                            'target' => tid,
                            'key' => key,
                            'countVal' => 0,
                            'amountVal' => 0.0,
                            'recordIds' => new List<String>()
                        });
                    }

                    Map<String, Object> lnk = linkAgg.get(key);
                    lnk.put('countVal', (Integer) lnk.get('countVal') + 1);
                    lnk.put('amountVal', (Decimal) lnk.get('amountVal') + amount);
                    ((List<String>) lnk.get('recordIds')).add(recId);
                }
            }

            records.add(row);

            // Story 7.2: Track full path strings
            if (!stopped) {
                String fullPath = String.join(pathValues, ' \u2192 ');
                Integer pc = fullPathCounts.containsKey(fullPath) ? fullPathCounts.get(fullPath) : 0;
                fullPathCounts.put(fullPath, pc + 1);
                Decimal pa = fullPathAmounts.containsKey(fullPath) ? fullPathAmounts.get(fullPath) : 0;
                fullPathAmounts.put(fullPath, pa + amount);
            }
        }

        // Section 6.3: Build D3-ready format
        List<Map<String, Object>> nodes = new List<Map<String, Object>>(nodeMap.values());
        List<Map<String, Object>> links = new List<Map<String, Object>>(linkAgg.values());

        // Story 7.1: Compute KPIs
        Map<String, Object> kpis = computeKpis(totalRecords, totalAmount, stepRecordCounts, pathFields.size());

        // Story 7.2: Top paths
        List<Map<String, Object>> topPaths = computeTopPaths(fullPathCounts, fullPathAmounts, metricType);

        Map<String, Object> result = new Map<String, Object>{
            'nodes' => nodes,
            'links' => links,
            'records' => records,
            'stepColumns' => pathFields,
            'kpis' => kpis,
            'topPaths' => topPaths
        };

        return result;
    }

    /**
     * Story 7.1: Compute guided insight KPIs.
     * Drop-off rate, conversion rate, average amount.
     */
    private static Map<String, Object> computeKpis(
        Integer totalRecords,
        Decimal totalAmount,
        Map<Integer, Integer> stepRecordCounts,
        Integer totalSteps
    ) {
        Decimal dropOffRate = 0;
        Decimal conversionRate = 0;
        Decimal avgAmount = totalRecords > 0 ? totalAmount / totalRecords : 0;

        if (totalSteps >= 2 && totalRecords > 0) {
            Integer firstStepCount = stepRecordCounts.containsKey(0) ? stepRecordCounts.get(0) : 0;
            Integer lastStepCount = stepRecordCounts.containsKey(totalSteps - 1) ? stepRecordCounts.get(totalSteps - 1) : 0;

            if (firstStepCount > 0) {
                conversionRate = ((Decimal) lastStepCount / firstStepCount * 100).setScale(1);
                dropOffRate = (100 - conversionRate).setScale(1);
            }
        }

        return new Map<String, Object>{
            'totalRecords' => totalRecords,
            'totalAmount' => totalAmount,
            'dropOffRate' => dropOffRate,
            'conversionRate' => conversionRate,
            'avgAmount' => avgAmount.setScale(2)
        };
    }

    /**
     * Story 7.2: Top paths — most common paths sorted by metric, limited to 10.
     */
    private static List<Map<String, Object>> computeTopPaths(
        Map<String, Integer> pathCounts,
        Map<String, Decimal> pathAmounts,
        String metricType
    ) {
        List<Map<String, Object>> paths = new List<Map<String, Object>>();

        for (String path : pathCounts.keySet()) {
            paths.add(new Map<String, Object>{
                'path' => path,
                'count' => pathCounts.get(path),
                'amount' => pathAmounts.containsKey(path) ? pathAmounts.get(path) : 0
            });
        }

        // Sort by metric descending — simple bubble sort (safe for small datasets)
        for (Integer i = 0; i < paths.size(); i++) {
            for (Integer j = i + 1; j < paths.size(); j++) {
                Decimal vi = metricType == 'AMOUNT'
                    ? (Decimal) paths[i].get('amount')
                    : (Decimal) paths[i].get('count');
                Decimal vj = metricType == 'AMOUNT'
                    ? (Decimal) paths[j].get('amount')
                    : (Decimal) paths[j].get('count');
                if (vj > vi) {
                    Map<String, Object> tmp = paths[i];
                    paths[i] = paths[j];
                    paths[j] = tmp;
                }
            }
        }

        // LIMIT 10
        List<Map<String, Object>> top = new List<Map<String, Object>>();
        for (Integer i = 0; i < Math.min(10, paths.size()); i++) {
            paths[i].put('rank', i + 1);
            top.add(paths[i]);
        }
        return top;
    }
}
