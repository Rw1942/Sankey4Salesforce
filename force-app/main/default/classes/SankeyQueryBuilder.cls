/**
 * Dynamic SOQL query builder for Sankey data.
 * Enforces WITH SECURITY_ENFORCED for FLS/object access.
 * Enforces LIMIT to protect governor limits.
 */
public with sharing class SankeyQueryBuilder {

    public static final Integer DEFAULT_LIMIT = 10000;
    public static final Integer SAMPLE_LIMIT = 100;

    private static final Set<String> ALLOWED_OPS = new Set<String>{
        '=', '!=', '<', '>', '<=', '>=', 'LIKE', 'IN'
    };

    /**
     * Builds dynamic SOQL from a config map.
     * SELECT {pathFields, metricField, recordIdField, Name}
     * FROM {objectApiName}
     * WHERE {filters}
     * WITH SECURITY_ENFORCED
     * LIMIT {limitSize}
     */
    public static String buildQuery(Map<String, Object> config) {
        String objectApiName = (String) config.get('objectApiName');
        List<Object> pathFieldsRaw = (List<Object>) config.get('pathFields');
        String metricType = (String) config.get('metricType');
        String metricField = (String) config.get('metricField');
        String recordIdField = (String) config.get('recordIdField');
        List<Object> filtersRaw = (List<Object>) config.get('filters');

        Set<String> selectFields = new Set<String>();
        selectFields.add('Id');
        selectFields.add('Name');

        if (String.isNotBlank(recordIdField) && recordIdField != 'Id') {
            selectFields.add(recordIdField);
        }

        for (Object pf : pathFieldsRaw) {
            selectFields.add((String) pf);
        }

        if (metricType == 'AMOUNT' && String.isNotBlank(metricField)) {
            selectFields.add(metricField);
        }

        String soql = 'SELECT ' + String.join(new List<String>(selectFields), ', ');
        soql += ' FROM ' + String.escapeSingleQuotes(objectApiName);

        List<String> whereClauses = buildWhereClauses(filtersRaw);
        if (!whereClauses.isEmpty()) {
            soql += ' WHERE ' + String.join(whereClauses, ' AND ');
        }

        soql += ' WITH SECURITY_ENFORCED';
        soql += ' LIMIT ' + DEFAULT_LIMIT;

        return soql;
    }

    /**
     * Build a COUNT() query for preview record count.
     */
    public static String buildCountQuery(Map<String, Object> config) {
        String objectApiName = (String) config.get('objectApiName');
        List<Object> filtersRaw = (List<Object>) config.get('filters');

        String soql = 'SELECT COUNT() FROM ' + String.escapeSingleQuotes(objectApiName);

        List<String> whereClauses = buildWhereClauses(filtersRaw);
        if (!whereClauses.isEmpty()) {
            soql += ' WHERE ' + String.join(whereClauses, ' AND ');
        }

        soql += ' WITH SECURITY_ENFORCED';
        return soql;
    }

    /**
     * Builds a lightweight sample query for field population analysis.
     * @param objectApiName SObject API name
     * @param fieldApiNames Fields to SELECT
     * @param dateFilter SOQL date literal clause, e.g. '>= LAST_N_DAYS:90'
     * @return SOQL string limited to SAMPLE_LIMIT rows
     */
    public static String buildSampleQuery(String objectApiName, List<String> fieldApiNames, String dateFilter) {
        if (!dateFilter.startsWith('>') && !dateFilter.startsWith('<')) {
            throw new IllegalArgumentException('Invalid dateFilter: ' + dateFilter);
        }

        Set<String> selectFields = new Set<String>();
        for (String f : fieldApiNames) {
            selectFields.add(String.escapeSingleQuotes(f));
        }

        String soql = 'SELECT ' + String.join(new List<String>(selectFields), ', ');
        soql += ' FROM ' + String.escapeSingleQuotes(objectApiName);
        soql += ' WHERE CreatedDate ' + dateFilter;
        soql += ' WITH SECURITY_ENFORCED';
        soql += ' ORDER BY CreatedDate DESC';
        soql += ' LIMIT ' + SAMPLE_LIMIT;

        return soql;
    }

    /**
     * Converts a list of raw filter objects into SOQL WHERE clause fragments.
     * Handles standard comparisons, date literals, LIKE, and IN operators.
     */
    private static List<String> buildWhereClauses(List<Object> filtersRaw) {
        List<String> whereClauses = new List<String>();
        if (filtersRaw == null) {
            return whereClauses;
        }

        for (Object fRaw : filtersRaw) {
            Map<String, Object> f = (Map<String, Object>) fRaw;
            String field = (String) f.get('field');
            String op = (String) f.get('operator');
            String val = (String) f.get('value');
            Boolean isDateLiteral = f.containsKey('isDateLiteral') && (Boolean) f.get('isDateLiteral');

            if (String.isBlank(field) || String.isBlank(op) || String.isBlank(val)) {
                continue;
            }
            if (!ALLOWED_OPS.contains(op)) {
                continue;
            }

            String safeField = String.escapeSingleQuotes(field);

            if (isDateLiteral) {
                whereClauses.add(safeField + ' = ' + String.escapeSingleQuotes(val));
            } else if (op == 'IN') {
                List<String> inVals = val.split(',');
                List<String> quoted = new List<String>();
                for (String v : inVals) {
                    quoted.add('\'' + String.escapeSingleQuotes(v.trim()) + '\'');
                }
                whereClauses.add(safeField + ' IN (' + String.join(quoted, ',') + ')');
            } else if (op == 'LIKE') {
                whereClauses.add(safeField + ' LIKE \'' + String.escapeSingleQuotes(val) + '\'');
            } else {
                whereClauses.add(safeField + ' ' + op + ' \'' + String.escapeSingleQuotes(val) + '\'');
            }
        }

        return whereClauses;
    }
}
