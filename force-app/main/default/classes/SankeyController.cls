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
            String recentSoql = SankeyQueryBuilder.buildSampleQuery(
                objectApiName, fieldApiNames, '>= LAST_N_DAYS:90'
            );
            String olderSoql = SankeyQueryBuilder.buildSampleQuery(
                objectApiName, fieldApiNames, '< LAST_N_YEARS:1'
            );

            List<SObject> recentRecords = Database.query(recentSoql);
            List<SObject> olderRecords = Database.query(olderSoql);

            Map<String, Map<String, Integer>> stats = new Map<String, Map<String, Integer>>();
            for (String field : fieldApiNames) {
                stats.put(field, new Map<String, Integer>{
                    'recent' => 0, 'older' => 0,
                    'recentSize' => recentRecords.size(),
                    'olderSize' => olderRecords.size()
                });
            }

            for (SObject rec : recentRecords) {
                for (String field : fieldApiNames) {
                    Object val = rec.get(field);
                    if (val != null && String.isNotBlank(String.valueOf(val))) {
                        stats.get(field).put('recent', stats.get(field).get('recent') + 1);
                    }
                }
            }

            for (SObject rec : olderRecords) {
                for (String field : fieldApiNames) {
                    Object val = rec.get(field);
                    if (val != null && String.isNotBlank(String.valueOf(val))) {
                        stats.get(field).put('older', stats.get(field).get('older') + 1);
                    }
                }
            }

            for (String field : fieldApiNames) {
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
}
