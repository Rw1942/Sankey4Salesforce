/**
 * Main Apex controller with @AuraEnabled entry points for the Sankey Builder.
 * Handles data generation, record counting, and object listing.
 * Security: WITH SECURITY_ENFORCED + FLS checks via SankeyQueryBuilder.
 */
public with sharing class SankeyController {

    /**
     * Generates Sankey data from a config JSON payload.
     * Builds dynamic SOQL, queries records, aggregates paths, computes KPIs.
     * @param configJson JSON string containing SankeyConfig DTO
     * @return JSON string containing full SankeyResponse
     */
    @AuraEnabled
    public static String getSankeyData(String configJson) {
        try {
            Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(configJson);

            String soql = SankeyQueryBuilder.buildQuery(config);
            List<SObject> rawRecords = Database.query(soql);

            if (rawRecords.isEmpty()) {
                throw new AuraHandledException('No records found matching the specified criteria.');
            }

            Map<String, Object> response = SankeyService.buildSankeyResponse(rawRecords, config);
            return JSON.serialize(response);
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw new AuraHandledException('Error generating Sankey data: ' + e.getMessage());
        }
    }

    /**
     * Preview record count before loading full dataset. Cacheable for identical filter configs.
     * @param configJson JSON string with objectApiName and filters
     * @return count of matching records
     */
    @AuraEnabled(cacheable=true)
    public static Integer getRecordCount(String configJson) {
        try {
            Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(configJson);
            String soql = SankeyQueryBuilder.buildCountQuery(config);
            return Database.countQuery(soql);
        } catch (Exception e) {
            throw new AuraHandledException('Error counting records: ' + e.getMessage());
        }
    }

    /**
     * Samples records from two time cohorts (recent 90 days, older than 1 year)
     * and returns per-field population percentages.
     * Uses 2 SOQL queries, max 200 rows total.
     * @param objectApiName SObject API name
     * @param fieldApiNames JSON array of field API names to check
     * @return JSON map: { fieldName: { recent, older, recentSize, olderSize } }
     */
    @AuraEnabled(cacheable=true)
    public static String getFieldPopulationStats(String objectApiName, List<String> fieldApiNames) {
        try {
            List<String> queryableFields = filterQueryableFields(objectApiName, fieldApiNames);

            if (queryableFields.isEmpty()) {
                return JSON.serialize(new Map<String, Object>());
            }

            String recentSoql = SankeyQueryBuilder.buildSampleQuery(
                objectApiName, queryableFields, '>= LAST_N_DAYS:90'
            );
            String olderSoql = SankeyQueryBuilder.buildSampleQuery(
                objectApiName, queryableFields, '< LAST_N_YEARS:1'
            );

            List<SObject> recentRecords = Database.query(recentSoql);
            List<SObject> olderRecords = Database.query(olderSoql);

            Map<String, Map<String, Integer>> stats = new Map<String, Map<String, Integer>>();
            for (String field : queryableFields) {
                stats.put(field, new Map<String, Integer>{
                    'recent' => 0, 'older' => 0,
                    'recentSize' => recentRecords.size(),
                    'olderSize' => olderRecords.size()
                });
            }

            for (SObject rec : recentRecords) {
                for (String field : queryableFields) {
                    Object val = rec.get(field);
                    if (val != null && String.isNotBlank(String.valueOf(val))) {
                        stats.get(field).put('recent', stats.get(field).get('recent') + 1);
                    }
                }
            }

            for (SObject rec : olderRecords) {
                for (String field : queryableFields) {
                    Object val = rec.get(field);
                    if (val != null && String.isNotBlank(String.valueOf(val))) {
                        stats.get(field).put('older', stats.get(field).get('older') + 1);
                    }
                }
            }

            for (String field : queryableFields) {
                Map<String, Integer> fs = stats.get(field);
                Integer rSize = fs.get('recentSize');
                Integer oSize = fs.get('olderSize');
                if (rSize > 0) {
                    Decimal pct = (Decimal.valueOf(fs.get('recent')) * 100) / rSize;
                    fs.put('recent', pct.setScale(0, System.RoundingMode.HALF_UP).intValue());
                }
                if (oSize > 0) {
                    Decimal pct = (Decimal.valueOf(fs.get('older')) * 100) / oSize;
                    fs.put('older', pct.setScale(0, System.RoundingMode.HALF_UP).intValue());
                }
            }

            return JSON.serialize(stats);
        } catch (Exception e) {
            throw new AuraHandledException('Error sampling field population: ' + e.getMessage());
        }
    }

    /**
     * Filters a list of field API names to only those that exist and are accessible
     * in the Schema describe for the given object. Removes system fields like
     * CloneSourceId that appear in UI metadata but cannot be used in SOQL SELECT.
     */
    private static List<String> filterQueryableFields(String objectApiName, List<String> fieldApiNames) {
        Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectApiName);
        if (objType == null) {
            return new List<String>();
        }
        Map<String, Schema.SObjectField> fieldMap = objType.getDescribe().fields.getMap();
        List<String> valid = new List<String>();
        for (String f : fieldApiNames) {
            Schema.SObjectField sf = fieldMap.get(f.toLowerCase());
            if (sf != null && sf.getDescribe().isAccessible()) {
                valid.add(f);
            }
        }
        return valid;
    }

    /**
     * Returns queryable Salesforce objects the current user can access.
     * Permission-aware: only returns objects the user has read access to.
     * @return JSON array of {apiName, label} objects
     */
    @AuraEnabled(cacheable=true)
    public static String getQueryableObjects() {
        try {
            List<Map<String, String>> results = new List<Map<String, String>>();

            Map<String, Schema.SObjectType> allObjects = Schema.getGlobalDescribe();
            for (String key : allObjects.keySet()) {
                Schema.DescribeSObjectResult objDesc = allObjects.get(key).getDescribe();

                if (objDesc.isQueryable() && objDesc.isAccessible() &&
                    (objDesc.isCreateable() || objDesc.isUpdateable())) {
                    results.add(new Map<String, String>{
                        'apiName' => objDesc.getName(),
                        'label' => objDesc.getLabel()
                    });
                }
            }

            return JSON.serialize(results);
        } catch (Exception e) {
            throw new AuraHandledException('Error loading objects: ' + e.getMessage());
        }
    }

    /**
     * Approximate record counts via Database.countQuery for a set of object API names.
     * Capped at 30 objects to stay well within the 100-SOQL governor limit.
     * Skips objects that throw (permission issues, non-countable entities).
     * @param objectApiNames list of SObject API names to count
     * @return JSON map of {objectApiName: count}
     */
    @AuraEnabled
    public static String getObjectRecordCounts(List<String> objectApiNames) {
        Map<String, Integer> countMap = new Map<String, Integer>();
        if (objectApiNames == null || objectApiNames.isEmpty()) {
            return JSON.serialize(countMap);
        }

        Integer cap = Math.min(objectApiNames.size(), 30);
        for (Integer i = 0; i < cap; i++) {
            String objName = String.escapeSingleQuotes(objectApiNames[i]);
            try {
                Integer cnt = Database.countQuery(
                    'SELECT COUNT() FROM ' + objName + ' WITH SECURITY_ENFORCED'
                );
                countMap.put(objectApiNames[i], cnt);
            } catch (Exception e) {
                // Skip objects the user can't count (permission, entity type, etc.)
            }
        }
        return JSON.serialize(countMap);
    }
}
