/**
 * Section 6.1 / Story 4.1 — Dynamic SOQL query builder for Sankey data.
 * Section 12: Enforces WITH SECURITY_ENFORCED for FLS/object access.
 * Section 13: Enforces LIMIT to protect governor limits.
 * Story 8.1: Large datasets paginated/limited.
 */
public with sharing class SankeyQueryBuilder {

    public static final Integer DEFAULT_LIMIT = 10000;

    /**
     * Section 6.1: Builds dynamic SOQL from a config map.
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

        // Build SELECT clause with path fields + metric + ID
        Set<String> selectFields = new Set<String>();
        selectFields.add('Id');
        selectFields.add('Name');

        if (String.isNotBlank(recordIdField) && recordIdField != 'Id') {
            selectFields.add(recordIdField);
        }

        for (Object pf : pathFieldsRaw) {
            selectFields.add((String) pf);
        }

        // Story 2.3: Include metric field if AMOUNT
        if (metricType == 'AMOUNT' && String.isNotBlank(metricField)) {
            selectFields.add(metricField);
        }

        String soql = 'SELECT ' + String.join(new List<String>(selectFields), ', ');
        soql += ' FROM ' + String.escapeSingleQuotes(objectApiName);

        // Story 2.2: Build WHERE clause from filters
        List<String> whereClauses = new List<String>();
        if (filtersRaw != null) {
            for (Object fRaw : filtersRaw) {
                Map<String, Object> f = (Map<String, Object>) fRaw;
                String field = (String) f.get('field');
                String op = (String) f.get('operator');
                String val = (String) f.get('value');
                Boolean isDateLiteral = f.containsKey('isDateLiteral') && (Boolean) f.get('isDateLiteral');

                if (String.isNotBlank(field) && String.isNotBlank(op) && String.isNotBlank(val)) {
                    String safeField = String.escapeSingleQuotes(field);

                    if (isDateLiteral) {
                        // Story 2.2: Date range quick filters use SOQL date literals
                        whereClauses.add(safeField + ' = ' + String.escapeSingleQuotes(val));
                    } else if (op == 'IN') {
                        // IN operator: split comma-separated values
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
            }
        }

        if (!whereClauses.isEmpty()) {
            soql += ' WHERE ' + String.join(whereClauses, ' AND ');
        }

        // Section 12: Security enforcement
        soql += ' WITH SECURITY_ENFORCED';

        // Section 13 + Story 8.1: Governor limit protection
        soql += ' LIMIT ' + DEFAULT_LIMIT;

        return soql;
    }

    /**
     * Story 2.2: Build a COUNT() query for preview record count.
     */
    public static String buildCountQuery(Map<String, Object> config) {
        String objectApiName = (String) config.get('objectApiName');
        List<Object> filtersRaw = (List<Object>) config.get('filters');

        String soql = 'SELECT COUNT() FROM ' + String.escapeSingleQuotes(objectApiName);

        List<String> whereClauses = new List<String>();
        if (filtersRaw != null) {
            for (Object fRaw : filtersRaw) {
                Map<String, Object> f = (Map<String, Object>) fRaw;
                String field = (String) f.get('field');
                String op = (String) f.get('operator');
                String val = (String) f.get('value');
                Boolean isDateLiteral = f.containsKey('isDateLiteral') && (Boolean) f.get('isDateLiteral');

                if (String.isNotBlank(field) && String.isNotBlank(op) && String.isNotBlank(val)) {
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
            }
        }

        if (!whereClauses.isEmpty()) {
            soql += ' WHERE ' + String.join(whereClauses, ' AND ');
        }

        soql += ' WITH SECURITY_ENFORCED';
        return soql;
    }
}
