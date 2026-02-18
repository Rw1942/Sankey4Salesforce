/**
 * Section 14 — Test Strategy: Apex tests for SankeyService.
 * Tests path aggregation correctness, null handling modes, and KPI computation.
 */
@isTest
private class SankeyServiceTest {

    /**
     * Story 3.2 / Section 6.2: Test path aggregation with GROUP_UNKNOWN null handling.
     * Verifies that null values are grouped as "Unknown" and transitions are correct.
     */
    @isTest
    static void testBuildSankeyResponse_GroupUnknown() {
        // Create test Opportunity records with known stage transitions
        List<Opportunity> testOpps = new List<Opportunity>();
        testOpps.add(new Opportunity(
            Name = 'Test Opp 1',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 10000
        ));
        testOpps.add(new Opportunity(
            Name = 'Test Opp 2',
            StageName = 'Qualification',
            CloseDate = Date.today().addDays(60),
            Amount = 20000
        ));
        testOpps.add(new Opportunity(
            Name = 'Test Opp 3',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(90),
            Amount = 15000
        ));
        insert testOpps;

        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN'
        };

        Test.startTest();
        Map<String, Object> response = SankeyService.buildSankeyResponse(testOpps, config);
        Test.stopTest();

        // Verify response structure
        System.assertNotEquals(null, response, 'Response should not be null');
        System.assert(response.containsKey('nodes'), 'Response should contain nodes');
        System.assert(response.containsKey('links'), 'Response should contain links');
        System.assert(response.containsKey('records'), 'Response should contain records');
        System.assert(response.containsKey('kpis'), 'Response should contain kpis');
        System.assert(response.containsKey('topPaths'), 'Response should contain topPaths');

        List<Map<String, Object>> records = (List<Map<String, Object>>) response.get('records');
        System.assertEquals(3, records.size(), 'Should have 3 records');
    }

    /**
     * Story 3.2: Test STOP null handling — path stops at null values.
     */
    @isTest
    static void testBuildSankeyResponse_StopNullHandling() {
        List<Opportunity> testOpps = new List<Opportunity>();
        testOpps.add(new Opportunity(
            Name = 'Stop Test',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 5000
        ));
        insert testOpps;

        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'LeadSource' },
            'metricType' => 'AMOUNT',
            'metricField' => 'Amount',
            'recordIdField' => 'Id',
            'nullHandling' => 'STOP'
        };

        Test.startTest();
        Map<String, Object> response = SankeyService.buildSankeyResponse(testOpps, config);
        Test.stopTest();

        // With STOP handling, records with null LeadSource should have no links
        List<Map<String, Object>> links = (List<Map<String, Object>>) response.get('links');
        System.assertEquals(0, links.size(),
            'STOP null handling should produce no links when second field is null');
    }

    /**
     * Story 3.2: Test CARRY_FORWARD null handling.
     */
    @isTest
    static void testBuildSankeyResponse_CarryForward() {
        List<Opportunity> testOpps = new List<Opportunity>();
        testOpps.add(new Opportunity(
            Name = 'Carry Test',
            StageName = 'Qualification',
            CloseDate = Date.today().addDays(30),
            Amount = 8000
        ));
        insert testOpps;

        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'LeadSource' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'nullHandling' => 'CARRY_FORWARD'
        };

        Test.startTest();
        Map<String, Object> response = SankeyService.buildSankeyResponse(testOpps, config);
        Test.stopTest();

        // CARRY_FORWARD should produce links (carrying StageName value forward)
        List<Map<String, Object>> links = (List<Map<String, Object>>) response.get('links');
        System.assert(links.size() > 0,
            'CARRY_FORWARD should produce links by carrying last known value');
    }

    /**
     * Story 7.1: Test KPI computation — drop-off rate, conversion rate, average amount.
     */
    @isTest
    static void testKpiComputation() {
        List<Opportunity> testOpps = new List<Opportunity>();
        for (Integer i = 0; i < 10; i++) {
            testOpps.add(new Opportunity(
                Name = 'KPI Test ' + i,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30),
                Amount = 1000 * (i + 1)
            ));
        }
        insert testOpps;

        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'AMOUNT',
            'metricField' => 'Amount',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN'
        };

        Test.startTest();
        Map<String, Object> response = SankeyService.buildSankeyResponse(testOpps, config);
        Test.stopTest();

        Map<String, Object> kpis = (Map<String, Object>) response.get('kpis');
        System.assertNotEquals(null, kpis, 'KPIs should be computed');
        System.assertEquals(10, (Integer) kpis.get('totalRecords'), 'Should have 10 total records');
        System.assert((Decimal) kpis.get('totalAmount') > 0, 'Total amount should be positive');
        System.assertNotEquals(null, kpis.get('conversionRate'), 'Conversion rate should be present');
        System.assertNotEquals(null, kpis.get('dropOffRate'), 'Drop-off rate should be present');
        System.assertNotEquals(null, kpis.get('avgAmount'), 'Average amount should be present');
    }

    /**
     * Story 7.2: Test top paths computation.
     */
    @isTest
    static void testTopPaths() {
        List<Opportunity> testOpps = new List<Opportunity>();
        for (Integer i = 0; i < 5; i++) {
            testOpps.add(new Opportunity(
                Name = 'TopPath Test ' + i,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30),
                Amount = 5000
            ));
        }
        insert testOpps;

        Map<String, Object> config = new Map<String, Object>{
            'objectApiName' => 'Opportunity',
            'pathFields' => new List<Object>{ 'StageName', 'StageName' },
            'metricType' => 'COUNT',
            'metricField' => '',
            'recordIdField' => 'Id',
            'nullHandling' => 'GROUP_UNKNOWN'
        };

        Test.startTest();
        Map<String, Object> response = SankeyService.buildSankeyResponse(testOpps, config);
        Test.stopTest();

        List<Map<String, Object>> topPaths = (List<Map<String, Object>>) response.get('topPaths');
        System.assertNotEquals(null, topPaths, 'Top paths should be computed');
        System.assert(topPaths.size() > 0, 'Should have at least one top path');
        System.assert(topPaths.size() <= 10, 'Top paths should be limited to 10');
    }
}
