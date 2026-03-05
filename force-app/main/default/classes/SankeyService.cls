/**
 * Path aggregation algorithm + KPI computation.
 * Handles null handling modes (STOP, GROUP_UNKNOWN, CARRY_FORWARD).
 * Computes guided insights: drop-off, conversion, top paths, avg amount.
 *
 * For each record, builds transitions (step_i -> step_{i+1}) += metric,
 * stored as Map<PathKey, Decimal>. Returns D3-ready nodes + links + KPIs.
 */
public with sharing class SankeyService {

    private static final String UNKNOWN_LABEL = 'Unknown';

    /**
     * Build the full Sankey response from raw SObject records.
     * @param rawRecords queried SObject records
     * @param config deserialized config map
     * @return JSON-serializable map with nodes, links, records, stepColumns, kpis, topPaths
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

        List<Map<String, Object>> records = new List<Map<String, Object>>();
        Map<String, Map<String, Object>> nodeMap = new Map<String, Map<String, Object>>();
        Map<String, Map<String, Object>> linkAgg = new Map<String, Map<String, Object>>();

        Map<Integer, Integer> stepRecordCounts = new Map<Integer, Integer>();
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

            List<String> pathValues = new List<String>();
            String lastValue = null;
            Boolean stopped = false;

            for (Integer si = 0; si < pathFields.size(); si++) {
                String col = pathFields[si];
                Object rawVal = rec.get(col);
                String val;

                if (rawVal == null || String.isBlank(String.valueOf(rawVal))) {
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

                Integer sc = stepRecordCounts.containsKey(si) ? stepRecordCounts.get(si) : 0;
                stepRecordCounts.put(si, sc + 1);

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

            if (!stopped) {
                String fullPath = String.join(pathValues, ' \u2192 ');
                Integer pc = fullPathCounts.containsKey(fullPath) ? fullPathCounts.get(fullPath) : 0;
                fullPathCounts.put(fullPath, pc + 1);
                Decimal pa = fullPathAmounts.containsKey(fullPath) ? fullPathAmounts.get(fullPath) : 0;
                fullPathAmounts.put(fullPath, pa + amount);
            }
        }

        List<Map<String, Object>> nodes = new List<Map<String, Object>>(nodeMap.values());
        List<Map<String, Object>> links = new List<Map<String, Object>>(linkAgg.values());

        Map<String, Object> kpis = computeKpis(totalRecords, totalAmount, stepRecordCounts, pathFields.size());
        List<Map<String, Object>> topPaths = computeTopPaths(fullPathCounts, fullPathAmounts, metricType);

        return new Map<String, Object>{
            'nodes' => nodes,
            'links' => links,
            'records' => records,
            'stepColumns' => pathFields,
            'kpis' => kpis,
            'topPaths' => topPaths
        };
    }

    /**
     * Compute guided insight KPIs: drop-off rate, conversion rate, average amount.
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
     * Top paths -- most common paths sorted by metric descending, limited to 10.
     */
    private static List<Map<String, Object>> computeTopPaths(
        Map<String, Integer> pathCounts,
        Map<String, Decimal> pathAmounts,
        String metricType
    ) {
        List<PathEntry> entries = new List<PathEntry>();
        for (String path : pathCounts.keySet()) {
            Integer cnt = pathCounts.get(path);
            Decimal amt = pathAmounts.containsKey(path) ? pathAmounts.get(path) : 0;
            Decimal sortVal = metricType == 'AMOUNT' ? amt : cnt;
            entries.add(new PathEntry(path, cnt, amt, sortVal));
        }

        entries.sort();

        List<Map<String, Object>> top = new List<Map<String, Object>>();
        for (Integer i = 0; i < Math.min(10, entries.size()); i++) {
            PathEntry e = entries[i];
            top.add(new Map<String, Object>{
                'path' => e.path,
                'count' => e.cnt,
                'amount' => e.amt,
                'rank' => i + 1
            });
        }
        return top;
    }

    private class PathEntry implements Comparable {
        public String path;
        public Integer cnt;
        public Decimal amt;
        public Decimal sortVal;

        public PathEntry(String path, Integer cnt, Decimal amt, Decimal sortVal) {
            this.path = path;
            this.cnt = cnt;
            this.amt = amt;
            this.sortVal = sortVal;
        }

        public Integer compareTo(Object other) {
            PathEntry that = (PathEntry) other;
            if (that.sortVal > this.sortVal) return 1;
            if (that.sortVal < this.sortVal) return -1;
            return 0;
        }
    }
}
