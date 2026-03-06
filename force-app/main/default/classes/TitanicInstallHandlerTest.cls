@IsTest
private class TitanicInstallHandlerTest {

    @IsTest
    static void freshInstallSeedsData() {
        Test.testInstall(new TitanicInstallHandler(), null, false);

        Integer count = [SELECT COUNT() FROM Titanic_Passenger__c];
        System.assert(count > 0, 'Expected Titanic records to be inserted on fresh install, got 0');
        System.debug('### Titanic_Passenger__c count after fresh install: ' + count);
    }

    @IsTest
    static void upgradeDoesNotReseed() {
        // Simulate upgrade from version 1.0
        Test.testInstall(new TitanicInstallHandler(), new Version(1, 0), true);

        Integer count = [SELECT COUNT() FROM Titanic_Passenger__c];
        System.assertEquals(0, count, 'Expected no records to be inserted on upgrade');
    }

    @IsTest
    static void idempotentWhenDataExists() {
        // Pre-populate one record so the guard fires
        insert new Titanic_Passenger__c(
            Passenger_Name__c = 'Test Passenger',
            Sex__c = 'Male',
            Survived__c = 'No',
            Travel_Class__c = 'Third'
        );

        Test.testInstall(new TitanicInstallHandler(), null, false);

        Integer count = [SELECT COUNT() FROM Titanic_Passenger__c];
        System.assertEquals(1, count, 'Expected no additional records when data already exists');
    }
}
