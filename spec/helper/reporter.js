var SpecReporter = require('jasmine-spec-reporter').SpecReporter;

jasmine.getEnv().clearReporters();               // remove default reporter logs
jasmine.getEnv().addReporter(new SpecReporter({  // add jasmine-spec-reporter
    spec: {
        displayErrorMessages: true,
        displayStacktrace: true,
        displaySuccessful: true,
        displayFailed: true,
        displayPending: true
    }
}));