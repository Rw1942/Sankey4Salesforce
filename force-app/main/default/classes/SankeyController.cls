/**
 * Story 4.1 — Main Apex controller with @AuraEnabled entry points.
 * Story 2.1 — Permission-aware object listing.
 * Story 2.2 — Preview record count.
 * Section 12 — Security: WITH SECURITY_ENFORCED + FLS checks.
 * Section 13 — Governor strategy: LIMIT records, maps not nested loops.
 */
public with sharing class SankeyController {

    /**
     * Story 4.1: Generates Sankey data from a config JSON payload.
     * Builds dynamic SOQL, queries records, aggregates paths, computes KPIs.
     * Returns full SankeyResponse JSON.
     */
    @AuraEnabled
    public static String getSankeyData(String configJson) {
        try {
            Map<String, Object> config = (Map<String, Object>) JSON.deserializeUntyped(configJson);

            // Section 6.1: Build and execute dynamic SOQL
            String soql = SankeyQueryBuilder.buildQuery(config);
            List<SObject> rawRecords = Database.query(soql);

            // Story 4.1: Error state if no data
            if (rawRecords.isEmpty()) {
                throw new AuraHandledException('No records found matching the specified criteria.');
            }

            // Section 6.2: Aggregate paths and compute response
            Map<String, Object> response = SankeyService.buildSankeyResponse(rawRecords, config);

            return JSON.serialize(response);
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            throw new AuraHandledException('Error generating Sankey data: ' + e.getMessage());
        }
    }

    /**
     * Story 2.2: Preview record count before loading full dataset.
     * Story 8.2: Cacheable for identical filter configs.
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
     * Story 2.1: Returns queryable Salesforce objects the current user can access.
     * Permission-aware: only returns objects the user has read access to.
     */
    @AuraEnabled(cacheable=true)
    public static String getQueryableObjects() {
        try {
            List<Map<String, String>> results = new List<Map<String, String>>();

            Map<String, Schema.SObjectType> allObjects = Schema.getGlobalDescribe();
            for (String key : allObjects.keySet()) {
                Schema.DescribeSObjectResult desc = allObjects.get(key).getDescribe();

                // Story 2.1: Filter to queryable, accessible objects
                if (desc.isQueryable() && desc.isAccessible() &&
                    (desc.isCreateable() || desc.isUpdateable())) {
                    results.add(new Map<String, String>{
                        'apiName' => desc.getName(),
                        'label' => desc.getLabel()
                    });
                }
            }

            // Sort by label for UX
            results.sort();

            return JSON.serialize(results);
        } catch (Exception e) {
            throw new AuraHandledException('Error loading objects: ' + e.getMessage());
        }
    }
}
