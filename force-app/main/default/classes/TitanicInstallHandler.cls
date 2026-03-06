global class TitanicInstallHandler implements InstallHandler {

    global void onInstall(InstallContext ctx) {
        // Only seed on fresh install, not on upgrade
        if (ctx.previousVersion() != null) return;

        // Skip if demo data already exists
        if ([SELECT COUNT() FROM Titanic_Passenger__c LIMIT 1] > 0) return;

        StaticResource sr;
        try {
            sr = [SELECT Body FROM StaticResource WHERE Name = 'TitanicData' LIMIT 1];
        } catch (Exception e) {
            return; // Static resource not found — abort silently
        }

        List<Titanic_Passenger__c> records = parseCsv(sr.Body.toString());
        if (!records.isEmpty()) {
            Database.insert(records, false); // allOrNone=false: partial success is fine
        }
    }

    private List<Titanic_Passenger__c> parseCsv(String csv) {
        List<Titanic_Passenger__c> records = new List<Titanic_Passenger__c>();
        List<String> lines = csv.split('\n');
        if (lines.size() < 2) return records;

        // Skip header (line 0), iterate data rows
        for (Integer i = 1; i < lines.size(); i++) {
            String line = lines[i].trim();
            if (String.isBlank(line)) continue;

            List<String> cols = splitCsvLine(line);
            if (cols.size() < 19) continue;

            Titanic_Passenger__c p = new Titanic_Passenger__c();
            p.Passenger_Name__c      = cols[0];
            p.Title__c               = cols[1];
            p.Survived__c            = cols[2];
            p.Travel_Class__c        = cols[3];
            p.Sex__c                 = cols[4];
            p.Age__c                 = toDecimal(cols[5]);
            p.Age_Group__c           = cols[6];
            p.Port_of_Embarkation__c = cols[7];
            p.Fare__c                = toDecimal(cols[8]);
            p.Fare_Category__c       = cols[9];
            p.Deck__c                = cols[10];
            p.Cabin__c               = cols[11];
            p.Ticket_Number__c       = cols[12];
            p.Siblings_Spouses__c    = toInteger(cols[13]);
            p.Parents_Children__c    = toInteger(cols[14]);
            p.Family_Group__c        = cols[15];
            p.Had_Lifeboat__c        = cols[16];
            p.Lifeboat__c            = cols[17];
            p.Home_Destination__c    = cols[18];
            records.add(p);
        }
        return records;
    }

    // Handles quoted fields containing commas
    private List<String> splitCsvLine(String line) {
        List<String> fields = new List<String>();
        Boolean inQuotes = false;
        String current = '';
        for (Integer i = 0; i < line.length(); i++) {
            String ch = line.substring(i, i + 1);
            if (ch == '"') {
                // Handle escaped quotes ("")
                if (inQuotes && i + 1 < line.length() && line.substring(i + 1, i + 2) == '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch == ',' && !inQuotes) {
                fields.add(current);
                current = '';
            } else {
                current += ch;
            }
        }
        fields.add(current);
        return fields;
    }

    private Decimal toDecimal(String s) {
        if (String.isBlank(s)) return null;
        try { return Decimal.valueOf(s.trim()); } catch (Exception e) { return null; }
    }

    private Integer toInteger(String s) {
        if (String.isBlank(s)) return null;
        try { return Integer.valueOf(s.trim()); } catch (Exception e) { return null; }
    }
}
