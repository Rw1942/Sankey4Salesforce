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
