/**
 * Provides tabular record data for the sankeyExplorer LWC.
 *
 * Return shape (JSON string):
 * {
 *   stepColumns: String[],
 *   records: [{
 *     id:     String,
 *     name:   String,
 *     amount: Decimal,
 *     <stepCol1>: String,
 *     <stepCol2>: String,
 *     ...
 *   }]
 * }
 *
 * The LWC transforms this tabular data into a Sankey graph client-side.
 * Swap the sample return for a real SOQL query when wiring to live data.
 */
public with sharing class SankeyDataController {

    @AuraEnabled(cacheable=true)
    public static String getSankeyData() {
        List<Map<String,Object>> records = new List<Map<String,Object>>{
            row('R001', 'Acme Corp Loan',   'Online',   'Qualified',     'Auto Review',   'Approved',  50000),
            row('R002', 'Beta Inc Loan',    'Online',   'Qualified',     'Manual Review', 'Approved',  120000),
            row('R003', 'Gamma LLC Loan',   'Branch',   'Qualified',     'Manual Review', 'Declined',  200000),
            row('R004', 'Delta Partners',   'Partner',  'Pre-Qualified', 'Committee',     'Approved',  500000),
            row('R005', 'Epsilon Finance',  'Online',   'Fast Track',    'Auto Review',   'Approved',  30000),
            row('R006', 'Zeta Holdings',    'Referral', 'Qualified',     'Manual Review', 'Approved',  175000),
            row('R007', 'Eta Services',     'Online',   'Qualified',     'Auto Review',   'Declined',  45000),
            row('R008', 'Theta Corp',       'Branch',   'Pre-Qualified', 'Manual Review', 'Approved',  90000),
            row('R009', 'Iota Group',       'Partner',  'Qualified',     'Committee',     'Declined',  300000),
            row('R010', 'Kappa Systems',    'Online',   'Fast Track',    'Auto Review',   'Approved',  25000),
            row('R011', 'Lambda Tech',      'Referral', 'Qualified',     'Auto Review',   'Approved',  60000),
            row('R012', 'Mu Industries',    'Branch',   'Qualified',     'Manual Review', 'Withdrawn', 150000),
            row('R013', 'Nu Ventures',      'Online',   'Pre-Qualified', 'Committee',     'Approved',  400000),
            row('R014', 'Xi Capital',       'Partner',  'Qualified',     'Manual Review', 'Approved',  220000),
            row('R015', 'Omicron Ltd',      'Online',   'Qualified',     'Auto Review',   'Declined',  35000),
            row('R016', 'Pi Solutions',     'Referral', 'Fast Track',    'Auto Review',   'Approved',  40000),
            row('R017', 'Rho Analytics',    'Branch',   'Qualified',     'Manual Review', 'Declined',  110000),
            row('R018', 'Sigma Health',     'Online',   'Qualified',     'Manual Review', 'Withdrawn', 85000),
            row('R019', 'Tau Energy',       'Partner',  'Pre-Qualified', 'Committee',     'Approved',  350000),
            row('R020', 'Upsilon Foods',    'Online',   'Qualified',     'Auto Review',   'Approved',  55000)
        };

        Map<String,Object> result = new Map<String,Object>{
            'stepColumns' => new List<String>{ 'Source', 'Qualification', 'Review', 'Outcome' },
            'records' => records
        };
        return JSON.serialize(result);
    }

    private static Map<String,Object> row(
        String rid, String rname,
        String src, String qual, String rev, String outcome,
        Decimal amt
    ) {
        return new Map<String,Object>{
            'id'            => rid,
            'name'          => rname,
            'Source'        => src,
            'Qualification' => qual,
            'Review'        => rev,
            'Outcome'       => outcome,
            'amount'        => amt
        };
    }
}
