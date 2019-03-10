const Request = require("request");
const MySQL = require("mysql");
const Express = require("express");

let logger = null;
let timerHandle = null;
let sampleInProgress = false;
let stopped = false;
let isUsingDatabase = true;
let databaseConnection = null;
let globalDatabaseConfiguration = null;

SiteMonitor = exports;

/**
 * Return a Promise for a database connection. Reject is called if a connection fails.
 * 
 * @returns {Promise} A promise for a database connection.
 */
function getDatabaseConnection() {
    return new Promise(function (resolve, reject) {
        const databaseConfiguration = globalDatabaseConfiguration;
        if (databaseConnection == null && isUsingDatabase) {
            databaseConnection = MySQL.createConnection({
                host: databaseConfiguration.host,
                port: databaseConfiguration.port || 3306,
                user: databaseConfiguration.user,
                password: databaseConfiguration.password,
                database: databaseConfiguration.database,
                charset: "utf8_general_ci"
            });
            try {
                databaseConnection.connect(function (databaseError) {
                    if (databaseError) {
                        isUsingDatabase = false;
                        reject(databaseError);
                    } else {
                        resolve(databaseConnection);
                    }
                });
            } catch (databaseError) {
                isUsingDatabase = false;
                reject(databaseError);
            }
        } else {
            isUsingDatabase = databaseConnection != null;
            resolve(databaseConnection);
        }
    });
}

/**
 * Initialize a database connection and verify the required tables are there. Should be called
 * only once at app start up. Checking the database connection and verifying the tables takes
 * time, so this function returns a Promise that should be checked before continuing.
 * 
 * @param {object} databaseConnection Database connection information object.
 *    host: "db host",
 *    database: "database",
 *    user: "user",
 *    password: "user-password",
 *    port: 3306 // optional will default to 3306
 * @returns {Promise} 
 */
function initializeDatabase(databaseConnection) {
    globalDatabaseConfiguration = databaseConnection;
    return new Promise(function (resolve, reject) {
        if (databaseConnection && databaseConnection.host && databaseConnection.user) {
            createDatabase()
                .then(function() {
                    resolve();
                })
                .catch(function (databaseError) {
                    reject(databaseError);
                });
        } else {
            resolve();
        }
    });
}

/**
 * Create the database schema only if it does not already exist.
 */
function createDatabase() {

    const createSitesTableSQL = `CREATE TABLE IF NOT EXISTS monitor_sites(
  monitor_site_id INT (11) NOT null AUTO_INCREMENT,
  site_name varchar (80) NOT null,
  site_url varchar (255) NOT null,
  search_token varchar(80) NOT NULL,
  max_response_time int NOT NULL DEFAULT 0,
  active int NOT NULL DEFAULT 1,
  PRIMARY KEY (monitor_site_id),
  UNIQUE INDEX site_name_ndx (site_name))
ENGINE = INNODB
CHARACTER SET utf8
COLLATE utf8_general_ci;`;

    const createSamplesTableSQL = `CREATE TABLE IF NOT EXISTS monitor_samples(
  monitor_sample_id INT (11) NOT null AUTO_INCREMENT,
  site_name varchar (80) NOT null,
  sample_type varchar(10) NOT NULL DEFAULT "sample",
  sample_time timestamp NOT null,
  response_time int NOT NULL,
  status_code int NOT NULL,
  error_code varchar(20) NOT NULL DEFAULT "OK",
  error_message varchar(500) NULL DEFAULT NULL,
  sample_data varchar(500) NULL DEFAULT NULL,
  PRIMARY KEY (monitor_sample_id),
  INDEX site_time_ndx (site_name, sample_time))
ENGINE = INNODB
CHARACTER SET utf8
COLLATE utf8_general_ci;`;

    return new Promise (function(resolve, reject) {
        getDatabaseConnection()
            .then(function (dbConnection) {
                if (dbConnection != null) {
                    dbConnection.query(createSitesTableSQL, function (databaseError, queryResults, fields) {
                        if (databaseError) {
                            // not able to create the table
                            reject(databaseError);
                        } else {
                            dbConnection.query(createSamplesTableSQL, function (databaseError, queryResults, fields) {
                                if (databaseError) {
                                    // not able to create the table
                                    reject(databaseError);
                                } else {
                                    resolve(queryResults, fields);
                                }
                            });
                        }
                    });
                }
            }, function (databaseError) {
                reject(databaseError);
            })
            .catch(function (databaseError) {
                reject(databaseError);
            });
    });
}

/**
 * There may be circumstances when we want to trash the database and start over.
 */
function resetDatabase() {
    const dropTablesSQL = `DROP TABLE IF EXISTS monitor_sites;
    DROP TABLE IF EXISTS monitor_samples;`;

    return new Promise(function (resolve, reject) {
        getDatabaseConnection()
            .then(function (dbConnection) {
                if (dbConnection != null) {
                    dbConnection.query(dropTablesSQL, function (databaseError, queryResults, fields) {
                        if (databaseError) {
                            // not able to drop the tables.
                            reject(databaseError);
                        } else {
                            createDatabase()
                                .then(function (queryResults, fields) {
                                    // tables created.
                                    resolve(queryResults, fields);
                                }, function (databaseError) {
                                    // table create has failed.
                                    reject(databaseError);
                                })
                                .catch(function(databaseError) {
                                    // table create has failed.
                                    reject(databaseError);
                                })
                        }
                    });
                }
            }, function (databaseError) {
                // getting a connection failed.
                reject(databaseError);
            })
            .catch(function (databaseError) {
                // getting a connection failed.
                reject(databaseError);
            });
    });
}

function updateSitesTable(siteList) {
    return new Promise(function (resolve, reject) {
        const saveSQL = `insert into monitor_sites set site_name=?, site_url=?, search_token=?, max_response_time=?, active=? on duplicate key update site_url=?, search_token=?, max_response_time=?, active=?`;
        let siteCount = siteList.length;

        siteList.forEach(function(site) {
            getDatabaseConnection()
                .then(function (dbConnection) {
                    if (dbConnection != null) {
                        const saveData = [site.sitename, site.sampleurl, site.expectedtoken, site.maxloadtime, site.active, site.sampleurl, site.expectedtoken, site.maxloadtime, site.active];

                        dbConnection.query(saveSQL, saveData, function (databaseError, queryResults, fields) {
                            if (databaseError) {
                                // insdate failed but keep going.
                                logger.error("Error inserting site information for " + site.sitename + ": " + databaseError.toString());
                            // } else {
                                // insert is good!
                            }
                            siteCount --;
                            if (siteCount < 1) {
                                resolve();
                            }
                        });
                    }
                }, function (databaseError) {
                    // getting a connection failed.
                    reject(databaseError);
                })
                .catch(function (databaseError) {
                    // getting a connection failed.
                    reject(databaseError);
                });
        })
    });
}

/**
 * Save a sample of an error. Provide this information through `sampleData` object. Defaults are provided
 * for all attributes except site_id.
 *   site_id: integer
 *   response_time: number
 *   status_code: number
 *   error_code: string
 *   error_message: string
 *   sample_data: string
 *
 * @param {object} sampleData Provide the pieces of information you have about the sample or the error.
 */
function saveSample(sampleData) {

    const saveSQL = `insert into monitor_samples set site_name=?, sample_type="sample", sample_time=now(), response_time=?, status_code=?, error_code=?, error_message=?, sample_data=?`;
    const sampleDataNormalized = [
        sampleData.site_name,
        sampleData.response_time || 0,
        sampleData.status_code   || 200,
        sampleData.error_code    || "OK",
        sampleData.error_message || "",
        sampleData.sample_data   || ""];

    return new Promise(function (resolve, reject) {
        if ( ! sampleData.site_name) {
            // sitename is mandatory
            reject(new Error("Cannot save sampe: sitename is mandatory but it was not provided."));
        } else if ( ! isUsingDatabase) {
            // not using the database is a soft error
            resolve(null, null);
        } else {
            getDatabaseConnection()
                .then(function (dbConnection) {
                    if (dbConnection != null) {
                        dbConnection.query(saveSQL, sampleDataNormalized, function (databaseError, queryResults, fields) {
                            if (databaseError) {
                                // insert/query failed.
                                reject(databaseError);
                            } else {
                                // insert is good!
                                resolve(queryResults, fields);
                            }
                        });
                    }
                }, function (databaseError) {
                    // getting a connection failed.
                    reject(databaseError);
                })
                .catch(function (databaseError) {
                    // getting a connection failed.
                    reject(databaseError);
                });
        }
    });
}

/**
 * Consolidate samples. This merges old records into aggregate samples.
 * Samples older than 1 month get merged into monthly samples by month
 * Samples older than 7 days get merged into weekly samples by week
 * Samples older than 1 day get merged into daily samples
 * Samples older than 1 hour get merged into hourly samples and the individual samples get deleted.
 */
function consolidateDatabase() {
}

function recordSampleError(siteConfiguration, responseTime, error) {
    logger.info("recordSampleError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleStatusError(siteConfiguration, responseTime, statusCode) {
    logger.info("recordSampleStatusError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleTokenFailError(siteConfiguration, responseTime) {
    logger.info("recordSampleTokenFailError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleErrorThresholdExceeded(siteConfiguration, responseTime) {
    logger.info("recordSampleErrorThresholdExceeded for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleSuccess(siteConfiguration, responseTime) {
    let sampleData = {
        site_name: siteConfiguration.sitename,
        response_time: responseTime
    };
    saveSample(sampleData)
        .then(function(queryResults, fields) {
            logger.info("recordSampleSuccess for " + siteConfiguration.sitename);
        }, function(databaseError) {
            logger.error("recordSampleSuccess FAILED for " + siteConfiguration.sitename + ": " + databaseError.toString());
        })
        .catch(function(databaseError) {
            logger.error("recordSampleSuccess caught error for " + siteConfiguration.sitename + ": " + databaseError.toString());
        });
}

/**
 * Conduct a sample given the site definition (from the configuration.) This is asynchronous:
 * a Promise is returned that will resolve once the sample is complete.
 * 
 * @param {object} siteConfiguration Site configuration record.
 * @returns {Promise} Returns a promise that should always resolve even when an error occurs.
 */
function sampleURL(siteConfiguration) {
    return new Promise(function(resolve, reject) {
        let startTime = Date.now();
        Request(siteConfiguration.sampleurl, function(error, response, body) {
            let responseTime = Date.now() - startTime;
            if (error) {
                recordSampleError(siteConfiguration, responseTime, error);
            } else if (response) {
                if (response.statusCode != 200) {
                    recordSampleStatusError(siteConfiguration, responseTime, response.statusCode);
                } else {
                    let foundToken = body.search(siteConfiguration.expectedtoken);
                    if (foundToken < 0) {
                        recordSampleTokenFailError(siteConfiguration, responseTime);
                    } else if ((responseTime / 1000) > siteConfiguration.alertloadtime) {
                        siteConfiguration.samplefailedcount ++;
                        siteConfiguration.sampleconsecutivefailedcount ++;
                        if (siteConfiguration.sampleconsecutivefailedcount >= siteConfiguration.alertthreshold) {
                            recordSampleErrorThresholdExceeded(siteConfiguration, responseTime);
                        } else {
                            recordSampleSuccess(siteConfiguration, responseTime);
                        }
                    } else {
                        siteConfiguration.sampleconsecutivefailedcount = 0;
                        recordSampleSuccess(siteConfiguration, responseTime);
                    }
                }
            } else {
                recordSampleError(siteConfiguration, responseTime, new Error("Service replied with no response."));
            }
            resolve();
        });
    });
}

/**
 * Request a sample for the intended site configuration. Once the site sample is complete this
 * function is responsible for queuing the next site to sample.
 * 
 * @param {object} siteConfiguration The site configuration record for the site to sample.
 * @param {Array} siteList The list of all site configurations so we can figure out the next site to sample.
 */
function sampleSite(siteConfiguration, siteList) {
    let timenow = Date.now();
    sampleInProgress = true;
    siteConfiguration.next_sample_time = timenow + siteConfiguration.samplefrequency;
    siteConfiguration.samplecount ++;
    sampleURL(siteConfiguration)
        .then(function() {
            sampleInProgress = false;
            queueNextSample(siteList);
        }, function (error) {
            sampleInProgress = false;
            logger.error("sampleSite soft error " + error.toString());
            queueNextSample(siteList);
        })
        .catch (function(exception) {
            sampleInProgress = false;
            logger.error("sampleSite soft exception " + exception.toString());
            queueNextSample(siteList);
        });
}

/**
 * This function scans the list of all active sites and determines the next site to sample.
 * Either a site's next sample time has passed, in which case we sample it immediately, or
 * a site's sample time is somewhere in the future and we find the nearest site's time and
 * wait until then. Once a site is ampled, this function is called again to determine the next site.
 * 
 * @param {Array} siteList The list of all sites we are monitoring.
 */
function queueNextSample(siteList) {

    // Queue a sample only if the app wasn't request to stop and another sample is not in progress.
    if ( ! stopped && ! sampleInProgress) {
        let timenow = Date.now();
        let next_sample_time = NaN;
        let next_sample_site = null;

        // iterate the site list and find the next soonest site to sample
        for (let siteIndex = 0; siteIndex < siteList.length; siteIndex ++) {
            let siteConfiguration = siteList[siteIndex];
            if (siteConfiguration.active) {
                if (isNaN(next_sample_time)) {
                    next_sample_time = siteConfiguration.next_sample_time;
                    next_sample_site = siteConfiguration;
                } else if (siteConfiguration.next_sample_time < next_sample_time) {
                    next_sample_time = siteConfiguration.next_sample_time;
                    next_sample_site = siteConfiguration;
                }
            }
        };
        if (next_sample_time <= timenow) {
            // this sites sample time has already passed, sample this site now
            setImmediate(sampleSite, next_sample_site, siteList)
        } else {
            // this sample will queue to run at some time in the future
            let deltaTime = next_sample_time - timenow
            timerHandle = setTimeout(function() {
                timerHandle = null;
                sampleSite(next_sample_site, siteList);
            }, deltaTime);
        }
    } else {
        // Either the monitor was stopped or another sample is in progress.
        // This could lead to a race condition or a drop-out.
        logger.error("queueNextSample logic error: another sample is in progress OR not sampling.");
    }
}

/**
 * Run the web server.
 * @param {object} configuration The complete configuration so we can setup the web server.
 */
function startWebServer(configuration) {
    const app = Express();
    const staticWebsiteOptions = {
        dotfiles: "ignore",
        etag: false,
        extensions: ["html"],
        index: ["index.html"],
        maxAge: "1d",
        redirect: false,
        setHeaders: function (response, path, stat) {
            response.set('x-timestamp', Date.now())
        }
    };

    app.get("/stop", function(request, response) {
        const query = request.query;
        logger.info("Stopping site monitor from /stop by " + request.get("referer"));
        response.send("The STOP function is not implemented. However, pass=" + query.pass);
        SiteMonitor.stopMonitor();
    });
    app.use(Express.static("./source/public", staticWebsiteOptions));
    app.listen(configuration.websiteport || 3399);
}

/* =============================================================================
   Exported function interface to operate the site monitor.
   ============================================================================= */

/**
 * Start monitoring all sites and let it run until requested to stop.
 * 
 * @param {object} configuration Configuration object. Refer to the configuration JSON for the format.
 * @param {object} debugLogger The logging facility.
 */
SiteMonitor.startMonitor = async function (configuration, debugLogger) {
    let timenow = Date.now();
    let siteList = configuration.sites;

    if (debugLogger) {
        logger = debugLogger;
    }
    initializeDatabase(configuration.database)
        .then(function() {
            // Validate and setup every site for sampling by initializing the records to a base condition.
            for (let siteIndex = 0; siteIndex < siteList.length; siteIndex ++) {
                let siteConfiguration = siteList[siteIndex];

                // site sample time is specified in seconds, convert that number to milliseconds.
                siteConfiguration.samplefrequency *= 1000;
                siteConfiguration.samplecount = 0;
                siteConfiguration.samplefailedcount = 0;
                siteConfiguration.sampleconsecutivefailedcount = 0;
                if (siteConfiguration.active) {
                    siteConfiguration.next_sample_time = timenow + siteConfiguration.samplefrequency;
                } else {
                    siteConfiguration.next_sample_time = -1;
                }
            };
            updateSitesTable(siteList)
                .then(function() {
                    queueNextSample(siteList);
                })
                .catch(function(databaseError) {
                    // Even if this update fails let's try to start the monitor anyway
                    // TODO: Log this error
                    logger.error("startMonitor caught updateSitesTable error " + databaseError.toString());
                    queueNextSample(siteList);
                });
        })
        .catch(function (databaseError) {
            logger.error("startMonitor caught initializeDatabase error " + databaseError.toString());
        });

    startWebServer(configuration);
};

/**
 * Reset the configuration on the fly, leaving the monitor running
 * while adding or removing site to monitor.
 * 
 * @param {object} configuration Configuration object.
 */
SiteMonitor.dynamicReset = function (configuration) {

};

/**
 * Stop monitoring. Call this function to shut down the site monitor.
 */
SiteMonitor.stopMonitor = function() {
    stopped = true;
    if (timerHandle != null) {
        clearTimeout(timerHandle);
        timerHandle = null;
    }
    setTimeout(function() {
        process.exit(0);
    }, 1000);
};
