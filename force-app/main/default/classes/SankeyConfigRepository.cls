/**
 * Story 9.1 — Save Sankey definition.
 * Story 9.2 — Load saved Sankey.
 * Section 10.1/10.2: CRUD for DS_Sankey_Config__c custom object.
 *
 * Provides save, load, and delete operations for Sankey configurations.
 * All queries enforce WITH SECURITY_ENFORCED (Section 12).
 */
public with sharing class SankeyConfigRepository {

    /**
     * Story 9.1: Save or update a Sankey configuration.
     * Accepts a JSON payload with config name + all settings.
     * Returns the saved record Id.
     */
    @AuraEnabled
    public static String saveConfig(String configJson) {
        try {
            Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(configJson);

            DS_Sankey_Config__c config = new DS_Sankey_Config__c();

            // If an Id is provided, update existing record
            if (payload.containsKey('id') && payload.get('id') != null) {
                config.Id = (Id) payload.get('id');
            }

            config.Name = (String) payload.get('name');
            config.Object_Api_Name__c = (String) payload.get('objectApiName');
            config.Metric_Type__c = (String) payload.get('metricType');
            config.Metric_Field__c = (String) payload.get('metricField');
            config.Record_Id_Field__c = (String) payload.get('recordIdField');
            config.Null_Handling__c = (String) payload.get('nullHandling');

            // Store complex objects as JSON strings
            if (payload.containsKey('filters')) {
                config.Filters_JSON__c = JSON.serialize(payload.get('filters'));
            }
            if (payload.containsKey('pathFields')) {
                config.Path_Fields_JSON__c = JSON.serialize(payload.get('pathFields'));
            }

            upsert config;
            return config.Id;
        } catch (Exception e) {
            throw new AuraHandledException('Error saving config: ' + e.getMessage());
        }
    }

    /**
     * Story 9.2: Retrieve all saved configurations owned by the current user.
     * Returns JSON array of saved configs.
     */
    @AuraEnabled(cacheable=true)
    public static String getMyConfigs() {
        try {
            List<DS_Sankey_Config__c> configs = [
                SELECT Id, Name, Object_Api_Name__c, Filters_JSON__c,
                       Path_Fields_JSON__c, Metric_Type__c, Metric_Field__c,
                       Record_Id_Field__c, Null_Handling__c, CreatedDate
                FROM DS_Sankey_Config__c
                WHERE OwnerId = :UserInfo.getUserId()
                WITH SECURITY_ENFORCED
                ORDER BY CreatedDate DESC
                LIMIT 50
            ];

            List<Map<String, Object>> results = new List<Map<String, Object>>();
            for (DS_Sankey_Config__c c : configs) {
                Map<String, Object> item = new Map<String, Object>{
                    'id' => c.Id,
                    'name' => c.Name,
                    'objectApiName' => c.Object_Api_Name__c,
                    'metricType' => c.Metric_Type__c,
                    'metricField' => c.Metric_Field__c,
                    'recordIdField' => c.Record_Id_Field__c,
                    'nullHandling' => c.Null_Handling__c,
                    'createdDate' => c.CreatedDate
                };

                // Deserialize JSON fields back into objects
                if (String.isNotBlank(c.Filters_JSON__c)) {
                    item.put('filters', JSON.deserializeUntyped(c.Filters_JSON__c));
                } else {
                    item.put('filters', new List<Object>());
                }

                if (String.isNotBlank(c.Path_Fields_JSON__c)) {
                    item.put('pathFields', JSON.deserializeUntyped(c.Path_Fields_JSON__c));
                } else {
                    item.put('pathFields', new List<Object>());
                }

                results.add(item);
            }

            return JSON.serialize(results);
        } catch (Exception e) {
            throw new AuraHandledException('Error loading configs: ' + e.getMessage());
        }
    }

    /**
     * Story 9.2: Delete a saved configuration.
     */
    @AuraEnabled
    public static void deleteConfig(String configId) {
        try {
            DS_Sankey_Config__c config = [
                SELECT Id FROM DS_Sankey_Config__c
                WHERE Id = :configId AND OwnerId = :UserInfo.getUserId()
                WITH SECURITY_ENFORCED
                LIMIT 1
            ];
            delete config;
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting config: ' + e.getMessage());
        }
    }
}
