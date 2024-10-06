/**
 * Test the expected operation of the site-monitor.js functionality.
 */
const fs = require("fs");
const axios = require('axios');
const MySQL = require("mysql");
const Express = require("express");
const siteMonitor = require("../source/site-monitor");

test('Expect site-monitor.js to exist and contain required functions', function() {
    expect(siteMonitor).toBeDefined();
    expect(siteMonitor.startMonitor).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.stopMonitor).toBeInstanceOf(Function);
});

test('Expect to be able to issue HTTP requests', function() {
    const sampleURL = "https://enginesis.com/x.php";
    axios.get(sampleURL)
    .then(function(response) {
        expect(response.status).toBe(200);
    })
    .catch(function(exception) {
        expect(exception).toBeDefined();
    })
});

test('Expect to be able to connect to database', async function() {
    const defaultConfigurationFile = "./source/configuration.json";
    let configuration;
    if (fs.existsSync(defaultConfigurationFile)) {
        let rawData = fs.readFileSync(defaultConfigurationFile);
        if (rawData != null) {
            configuration = JSON.parse(rawData) || {};
        } else {
            configuration = null;
        }
    }
    expect(configuration).toBeInstanceOf(Object);
    expect(configuration.database).toBeInstanceOf(Object);
    expect(configuration.database.database).toBeDefined();
    let databaseConfiguration = configuration.database;
    try {
        databaseConnection = MySQL.createConnection({
            host: databaseConfiguration.host,
            port: databaseConfiguration.port || 3306,
            user: databaseConfiguration.user,
            password: databaseConfiguration.password,
            database: databaseConfiguration.database,
            charset: "utf8_general_ci"
        });
        databaseConnection.connect(function (databaseError) {
            expect(databaseError).toBe(null);
        });
    } catch (databaseError) {
        expect(databaseError).toMatch("error");
    }
});
