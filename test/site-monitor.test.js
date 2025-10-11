/**
 * Test the expected operation of the site-monitor.js functionality.
 */
const fs = require("fs");
const axios = require('axios');
const MySQL = require("mysql2");
const Express = require("express");
const siteMonitor = require("../source/site-monitor");

test('Expect site-monitor.js to exist and contain required functions', function() {
    expect(siteMonitor).toBeDefined();
    expect(siteMonitor.startMonitor).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.stopMonitor).toBeInstanceOf(Function);
});

describe("HTTP tests", function() {
    test('Expect to be able to issue HTTP requests', function() {
        return new Promise(function(resolve) {
            const sampleURL = "https://enginesis.com/x.php";
            axios.get(sampleURL)
            .then(function(response) {
                expect(response.status).toBe(200);
                resolve();
            })
            .catch(function(exception) {
                expect(exception).toBeDefined();
                resolve();
            });
        });
    });
});

describe("Database tests", function() {
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
        return new Promise(function(resolve) {
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
                    resolve();
                    // databaseConnection.end(function(databaseError) {
                    //     console.log("close");
                    //     expect(databaseError).toBe(null);
                    //     resolve();
                    // });
                });
            } catch (databaseError) {
                expect(databaseError).toMatch("error");
                resolve();
            }
        });
    });
});
