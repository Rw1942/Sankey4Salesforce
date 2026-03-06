/**
 * Section 14 — Test Strategy: Integration tests for SankeyController.
 * Tests getSankeyData, getRecordCount, getQueryableObjects, and config save/load.
 * Includes security enforcement negative tests.
 */
@isTest
private class SankeyControllerTest {

    @testSetup
    static void setupTestData() {
        List<Opportunity> opps = new List<Opportunity>();
        for (Integer i = 0; i < 20; i++) {
            opps.add(new Opportunity(
                Name = 'Test Opp ' + i,
                StageName = Math.mod(i, 2) == 0 ? 'Prospecting' : 'Qualification',
                CloseDate = Date.today().addDays(30 + i),
                Amount = 1000 * (i + 1)
            ));
        }
        insert opps;
    }

    /**
     * Story 4.1: Test getSankeyData — full integration with dynamic SOQL + aggregation.
     */
    @isTest
    static void testGetSankeyData_Success() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN',
            'filters' => new List<Object>()
        };

        Test.startTest();
        String responseJson = SankeyController.getSankeyData(JSON.serialize(config));
        Test.stopTest();

        System.assertNotEquals(null, responseJson, 'Response should not be null');
        Map<String, Object> response = (Map<String, Object>) JSON.deserializeUntyped(responseJson);
        System.assert(response.containsKey('nodes'), 'Response should contain nodes');
        System.assert(response.containsKey('links'), 'Response should contain links');
        System.assert(response.containsKey('records'), 'Response should contain records');

        List<Object> records = (List<Object>) response.get('records');
        System.assertEquals(20, records.size(), 'Should return 20 records');
    }

    /**
     * Story 4.1: Test getSankeyData with AMOUNT metric.
     */
    @isTest
    static void testGetSankeyData_AmountMetric() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'AMOUNT',
            'metricField' => 'Amount',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN',
            'filters' => new List<Object>()
        };

        Test.startTest();
        String responseJson = SankeyController.getSankeyData(JSON.serialize(config));
        Test.stopTest();

        Map<String, Object> response = (Map<String, Object>) JSON.deserializeUntyped(responseJson);
        System.assertNotEquals(null, response, 'Response should not be null');
    }

    /**
     * Story 4.1: Test getSankeyData with no matching records — should throw error.
     */
    @isTest
    static void testGetSankeyData_NoRecords() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN',
            'filters' => new List<Object>{
                new Map<String, Object>{
                    'field' => 'Name',
                    'operator' => '=',
                    'value' => 'NonExistentRecord_XYZ_123'
                }
            }
        };

        Test.startTest();
        try {
            SankeyController.getSankeyData(JSON.serialize(config));
            System.assert(false, 'Should have thrown AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('No records found'),
                'Error should indicate no records found');
        }
        Test.stopTest();
    }

    /**
     * Story 2.2: Test getRecordCount — preview count.
     */
    @isTest
    static void testGetRecordCount() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'filters' => new List<Object>()
        };

        Test.startTest();
        Integer count = SankeyController.getRecordCount(JSON.serialize(config));
        Test.stopTest();

        System.assertEquals(20, count, 'Should count 20 Opportunity records');
    }

    /**
     * Story 2.2: Test getRecordCount with filters.
     */
    @isTest
    static void testGetRecordCount_WithFilters() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'filters' => new List<Object>{
                new Map<String, Object>{
                    'field' => 'StageName',
                    'operator' => '=',
                    'value' => 'Prospecting'
                }
            }
        };

        Test.startTest();
        Integer count = SankeyController.getRecordCount(JSON.serialize(config));
        Test.stopTest();

        System.assertEquals(10, count, 'Should count 10 Prospecting opportunities');
    }

    /**
     * Story 2.1: Test getQueryableObjects — permission-aware object listing.
     */
    @isTest
    static void testGetQueryableObjects() {
        Test.startTest();
        String resultJson = SankeyController.getQueryableObjects();
        Test.stopTest();

        System.assertNotEquals(null, resultJson, 'Result should not be null');
        List<Object> objects = (List<Object>) JSON.deserializeUntyped(resultJson);
        System.assert(objects.size() > 0, 'Should return at least one queryable object');

        // Verify Opportunity is in the list (standard object always accessible in tests)
        Boolean foundOpp = false;
        for (Object obj : objects) {
            Map<String, Object> item = (Map<String, Object>) obj;
            if ((String) item.get('apiName') == 'Opportunity') {
                foundOpp = true;
                break;
            }
        }
        System.assert(foundOpp, 'Opportunity should be in the queryable objects list');
    }

    /**
     * Story 9.1/9.2: Test config save and load via SankeyConfigRepository.
     */
    @isTest
    static void testSaveAndLoadConfig() {
        Map<String, Object> payload = new Map<String, Object>{
            'name' => 'Test Config',
            'objectApiName' => 'Opportunity',
            'filters' => new List<Object>(),
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN'
        };

        Test.startTest();

        // Story 9.1: Save
        String savedId = SankeyConfigRepository.saveConfig(JSON.serialize(payload));
        System.assertNotEquals(null, savedId, 'Should return saved record Id');

        // Story 9.2: Load
        String configsJson = SankeyConfigRepository.getMyConfigs();
        List<Object> configs = (List<Object>) JSON.deserializeUntyped(configsJson);
        System.assert(configs.size() > 0, 'Should have at least one saved config');

        Map<String, Object> loaded = (Map<String, Object>) configs[0];
        System.assertEquals('Test Config', (String) loaded.get('name'),
            'Loaded config name should match');
        System.assertEquals('Opportunity', (String) loaded.get('objectApiName'),
            'Loaded object should match');

        // Story 9.2: Delete
        SankeyConfigRepository.deleteConfig(savedId);
        String afterDelete = SankeyConfigRepository.getMyConfigs();
        List<Object> remaining = (List<Object>) JSON.deserializeUntyped(afterDelete);
        System.assertEquals(0, remaining.size(), 'Should have no configs after delete');

        Test.stopTest();
    }

    /**
     * Test getFieldPopulationStats — returns per-field population percentages
     * for recent and older cohorts.
     */
    @isTest
    static void testGetFieldPopulationStats_Success() {
        Test.startTest();
        String resultJson = SankeyController.getFieldPopulationStats(
            'Opportunity',
            new List<String>{ 'StageName', 'Amount', 'Description' }
        );
        Test.stopTest();

        System.assertNotEquals(null, resultJson, 'Result should not be null');
        Map<String, Object> stats = (Map<String, Object>) JSON.deserializeUntyped(resultJson);
        System.assert(stats.containsKey('StageName'), 'Stats should include StageName');
        System.assert(stats.containsKey('Amount'), 'Stats should include Amount');

        Map<String, Object> stageStats = (Map<String, Object>) stats.get('StageName');
        System.assert(stageStats.containsKey('recent'), 'Should have recent percentage');
        System.assert(stageStats.containsKey('older'), 'Should have older percentage');
        System.assert(stageStats.containsKey('recentSize'), 'Should have recentSize');
        System.assert(stageStats.containsKey('olderSize'), 'Should have olderSize');
    }

    /**
     * Test getFieldPopulationStats — handles object with no recent/older records gracefully.
     */
    @isTest
    static void testGetFieldPopulationStats_EmptyCohorts() {
        Test.startTest();
        String resultJson = SankeyController.getFieldPopulationStats(
            'Opportunity',
            new List<String>{ 'StageName' }
        );
        Test.stopTest();

        Map<String, Object> stats = (Map<String, Object>) JSON.deserializeUntyped(resultJson);
        Map<String, Object> stageStats = (Map<String, Object>) stats.get('StageName');
        Integer recentSize = ((Decimal) stageStats.get('recentSize')).intValue();
        Integer olderSize = ((Decimal) stageStats.get('olderSize')).intValue();
        // Test data was just created, so older cohort (>1yr) should be empty
        System.assertEquals(0, olderSize, 'Older cohort should be empty for freshly created test data');
        System.assert(recentSize >= 0, 'recentSize should be non-negative');
    }

    /**
     * Test buildSampleQuery — verifies SOQL structure.
     */
    @isTest
    static void testBuildSampleQuery() {
        String soql = SankeyQueryBuilder.buildSampleQuery(
            'Opportunity',
            new List<String>{ 'StageName', 'Amount' },
            '>= LAST_N_DAYS:90'
        );

        System.assert(soql.contains('StageName'), 'Query should select StageName');
        System.assert(soql.contains('Amount'), 'Query should select Amount');
        System.assert(soql.contains('FROM Opportunity'), 'Query should target Opportunity');
        System.assert(soql.contains('CreatedDate >= LAST_N_DAYS:90'), 'Query should filter by date');
        System.assert(soql.contains('WITH SECURITY_ENFORCED'), 'Query should enforce security');
        System.assert(soql.contains('LIMIT ' + SankeyQueryBuilder.SAMPLE_LIMIT),
            'Query should use sample limit');
    }

    /**
     * Section 12: Test that dynamic SOQL includes security enforcement.
     * Verifies the query builder includes WITH SECURITY_ENFORCED.
     */
    @isTest
    static void testQueryBuilderSecurity() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'filters' => new List<Object>()
        };

        String soql = SankeyQueryBuilder.buildQuery(config);
        System.assert(soql.contains('WITH SECURITY_ENFORCED'),
            'Query should include WITH SECURITY_ENFORCED');
        System.assert(soql.contains('LIMIT'),
            'Query should include LIMIT for governor protection');
    }

    /**
     * Section 13: Test query builder LIMIT enforcement.
     */
    @isTest
    static void testQueryBuilderLimit() {
        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'filters' => new List<Object>()
        };

        String soql = SankeyQueryBuilder.buildQuery(config);
        System.assert(soql.contains('LIMIT ' + SankeyQueryBuilder.DEFAULT_LIMIT),
            'Query should include the default limit of ' + SankeyQueryBuilder.DEFAULT_LIMIT);
    }
}
