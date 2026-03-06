/**
 * CRUD operations for DS_Sankey_Config__c custom object.
 * Provides save, load, and delete for Sankey configurations.
 * All queries enforce WITH SECURITY_ENFORCED.
 */
public with sharing class SankeyConfigRepository {

    /**
     * Save or update a Sankey configuration.
     * @param configJson JSON payload with config name + all settings
     * @return the saved record Id
     */
    @AuraEnabled
    public static String saveConfig(String configJson) {
        try {
            Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(configJson);

            Boolean isUpdate = payload.containsKey('id') && payload.get('id') != null;

            if (isUpdate) {
                if (!Schema.SObjectType.DS_Sankey_Config__c.isUpdateable()) {
                    AuraHandledException ahe = new AuraHandledException('Insufficient permissions to update configurations.');
                    ahe.setMessage('Insufficient permissions to update configurations.');
                    throw ahe;
                }
                List<DS_Sankey_Config__c> existing = [
                    SELECT Id FROM DS_Sankey_Config__c
                    WHERE Id = :((Id) payload.get('id')) AND OwnerId = :UserInfo.getUserId()
                    WITH SECURITY_ENFORCED
                    LIMIT 1
                ];
                if (existing.isEmpty()) {
                    AuraHandledException ahe = new AuraHandledException('Configuration not found or not owned by you.');
                    ahe.setMessage('Configuration not found or not owned by you.');
                    throw ahe;
                }
            } else {
                if (!Schema.SObjectType.DS_Sankey_Config__c.isCreateable()) {
                    AuraHandledException ahe = new AuraHandledException('Insufficient permissions to create configurations.');
                    ahe.setMessage('Insufficient permissions to create configurations.');
                    throw ahe;
                }
            }

            DS_Sankey_Config__c config = new DS_Sankey_Config__c();

            if (isUpdate) {
                config.Id = (Id) payload.get('id');
            }

            config.Name = (String) payload.get('name');
            config.Object_Api_Name__c = (String) payload.get('objectApiName');
            config.Metric_Type__c = (String) payload.get('metricType');
            config.Metric_Field__c = (String) payload.get('metricField');
            config.Record_Id_Field__c = (String) payload.get('recordIdField');
            config.Null_Handling__c = (String) payload.get('nullHandling');

            if (payload.containsKey('filters')) {
                config.Filters_JSON__c = JSON.serialize(payload.get('filters'));
            }
            if (payload.containsKey('pathFields')) {
                config.Path_Fields_JSON__c = JSON.serialize(payload.get('pathFields'));
            }

            upsert config;
            return config.Id;
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage('Error saving config: ' + e.getMessage());
            throw ahe;
        }
    }

    /**
     * Retrieve all saved configurations owned by the current user.
     * @return JSON array of saved configs
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
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage('Error loading configs: ' + e.getMessage());
            throw ahe;
        }
    }

    /**
     * Delete a saved configuration.
     * @param configId the Id of the config to delete
     */
    @AuraEnabled
    public static void deleteConfig(String configId) {
        try {
            if (!Schema.SObjectType.DS_Sankey_Config__c.isDeletable()) {
                AuraHandledException ahe = new AuraHandledException('Insufficient permissions to delete configurations.');
                ahe.setMessage('Insufficient permissions to delete configurations.');
                throw ahe;
            }
            DS_Sankey_Config__c config = [
                SELECT Id FROM DS_Sankey_Config__c
                WHERE Id = :configId AND OwnerId = :UserInfo.getUserId()
                WITH SECURITY_ENFORCED
                LIMIT 1
            ];
            delete config;
        } catch (AuraHandledException ahe) {
            throw ahe;
        } catch (Exception e) {
            AuraHandledException ahe = new AuraHandledException(e.getMessage());
            ahe.setMessage('Error deleting config: ' + e.getMessage());
            throw ahe;
        }
    }
}
