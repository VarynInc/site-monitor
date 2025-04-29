/**
 * Site monitor export module. Provides public interface on the exported module `SiteMonitor`.
 * SiteMonitor.startMonitor(configuration, debugLogger): Start the site monitor with a configuration and a logging interface.
 * SiteMonitor.stopMonitor(): Stop the site monitor.
 * SiteMonitor.dynamicReset(configuration): Restart the site monitor with a new configuration while leaving any current captured data in tact.
 */
const axios = require('axios');
const fs = require("fs");
const MySQL = require("mysql2");
const Express = require("express");
const NodeMailer = require("nodemailer");
const MailGunTransport = require('nodemailer-mailgun-transport');

let logger = null;
let timerHandle = null;
let sampleInProgress = false;
let stopped = false;
let isUsingDatabase = true;
let databaseConnection = null;
let globalDatabaseConfiguration = null;
let globalEmailConfiguration = null;

SiteMonitor = exports;


/**
 * Replace occurrences of {token} with matching keyed values from parameters array.
 *
 * @param {string} text text containing tokens to be replaced.
 * @param {Array} parameters array/object of key/value pairs to match keys as tokens in text and replace with value.
 * @return {string} text replaced string.
 */
function tokenReplace(text, parameters) {
    for (const token in parameters) {
        if (parameters.hasOwnProperty(token)) {
            const regexMatch = new RegExp("{" + token + "}", "g");
            text = text.replace(regexMatch, parameters[token]);
        }
    }
    return text;
};

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
            reject(new Error("Cannot save sample: sitename is mandatory but it was not provided."));
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
 * consecutive error records get merged into error samples
 * Samples older than 1 month get merged into monthly samples by month
 * Samples older than 7 days get merged into weekly samples by week
 * Samples older than 1 day get merged into daily samples
 * Samples older than 1 hour get merged into hourly samples and the individual samples get deleted.
 */
function consolidateDatabase() {
    /*
    SELECT site_name, COUNT(*) AS samples, MIN(sample_time) AS first_sample, MAX(sample_time) AS last_sample, AVG(response_time) AS response_time
    FROM monitor_samples
    WHERE sample_type="sample"
    GROUP BY site_name
    ORDER BY 1;
    */
}

function recordSampleError(siteConfiguration, responseTime, error) {
    logger.error("recordSampleError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleStatusError(siteConfiguration, responseTime, statusCode) {
    logger.error("recordSampleStatusError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleTokenFailError(siteConfiguration, responseTime) {
    logger.error("recordSampleTokenFailError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleErrorThresholdExceeded(siteConfiguration, responseTime) {
    logger.error("recordSampleErrorThresholdExceeded for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleSuccess(siteConfiguration, responseTime) {
    let sampleData = {
        site_name: siteConfiguration.sitename,
        response_time: responseTime
    };
    saveSample(sampleData)
    .then(function(queryResults, fields) {
        logger.info({"sitename": siteConfiguration.sitename, "message": "recordSampleSuccess for " + siteConfiguration.sitename});
    }, function(databaseError) {
        logger.error("recordSampleSuccess FAILED for " + siteConfiguration.sitename + ": " + databaseError.toString());
    })
    .catch(function(databaseError) {
        logger.error("recordSampleSuccess caught error for " + siteConfiguration.sitename + ": " + databaseError.toString());
    });
}

/**
 * Send an alert. The type of alert would depend on the site configuration.
 * 
 * @param {object} siteConfiguration 
 */
async function sendAlert(siteConfiguration) {
    const emailConfiguration = globalEmailConfiguration;
    const emailList = siteConfiguration.alertemail;
    if (emailConfiguration.host && Array.isArray(emailList) && emailList.length > 0) {
        var nodemailerMailgun = NodeMailer.createTransport(MailGunTransport({
            auth: {
                api_key: emailConfiguration.apikey,
                domain: emailConfiguration.domain
            }
        }));
        let toList = emailList.join(", ");
        let mailOptions = {
            from: '"Enginesis Support" <support@enginesis.com>',
            to: toList,
            subject: "Site monitor alert from " + siteConfiguration.sitename,
            text: "* Site monitor alert *\n\nThis is a test alert message from site monitor on behalf of " + siteConfiguration.sitename,
            html: "<h1>Site monitor alert</h1><p>This is a test alert message from site monitor on behalf of " + siteConfiguration.sitename + "</p>"
        };
        logger.info("sending alert email to " + toList + " for site " + siteConfiguration.sitename);
        let mailResponse = await nodemailerMailgun.sendMail(mailOptions);
        logger.info("alert email response " + JSON.stringify(mailResponse));
    }
}

/**
 * Render the status HTML page.
 * @param {Request} request Express request object.
 * @param {Response} response Express response object
 */
function renderStatusPage(request, response) {
    const statusTemplate = "./source/views/status.html";
    const query = request.query;
    logger.info("SiteMonitor request for /status by " + request.get("referer") + " from " + request.ip);
    if (query.pass == configuration.shutdownpassword) {
        // read template file views/status.html
        // replace
        let pageParameters = {
            status: "Running",
            lastSample: "today",
            lastError: "yesterday",
            sitesTable: "this is the table HTML"
        };
        fs.readFile(statusTemplate, "utf8", function(fsError, fileContent) {
            if (fsError) {
                logger.error("SiteMonitor cannot read template file " + statusTemplate + ": " + fsError.toString());
            } else {
                response.send(tokenReplace(fileContent, pageParameters));
            }
        });
    } else {
        response.send("You contacted the STATUS endpoint.");
    }
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
        axios.get(siteConfiguration.sampleurl)
        .then(function(response) {
            const responseTime = Date.now() - startTime;
            if (response.status != 200) {
                recordSampleStatusError(siteConfiguration, responseTime, response.status);
            } else {
                let foundToken = response.data.search(siteConfiguration.expectedtoken);
                if (foundToken < 0) {
                    recordSampleTokenFailError(siteConfiguration, responseTime);
                } else if ((responseTime / 1000) > siteConfiguration.alertloadtime) {
                    siteConfiguration.samplefailedcount ++;
                    siteConfiguration.sampleconsecutivefailedcount ++;
                    if (siteConfiguration.sampleconsecutivefailedcount >= siteConfiguration.alertthreshold) {
                        recordSampleErrorThresholdExceeded(siteConfiguration, responseTime);
                        if ( ! siteConfiguration.alerted) {
                            siteConfiguration.alerted = true;
                            sendAlert(siteConfiguration);
                        }
                    } else {
                        recordSampleSuccess(siteConfiguration, responseTime);
                    }
                } else {
                    siteConfiguration.sampleconsecutivefailedcount = 0;
                    recordSampleSuccess(siteConfiguration, responseTime);
                }
            }
            resolve();
        })
        .catch(function(requestError) {
            const responseTime = Date.now() - startTime;
            if (requestError.response) {
                recordSampleStatusError(siteConfiguration, responseTime, requestError.response.status);
            } else {
                recordSampleError(siteConfiguration, responseTime, requestError.toString());
            }
            reject(requestError);
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
    let timeNow = Date.now();
    sampleInProgress = true;
    siteConfiguration.next_sample_time = timeNow + siteConfiguration.samplefrequency;
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
 * wait until then. Once a site is sampled, this function is called again to determine the next site.
 * 
 * @param {Array} siteList The list of all sites we are monitoring.
 */
function queueNextSample(siteList) {

    // Queue a sample only if the app wasn't request to stop and another sample is not in progress.
    if ( ! stopped && ! sampleInProgress) {
        let timeNow = Date.now();
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
        if (next_sample_time <= timeNow) {
            // this sites sample time has already passed, sample this site now
            setImmediate(sampleSite, next_sample_site, siteList)
        } else {
            // this sample will queue to run at some time in the future
            let deltaTime = next_sample_time - timeNow
            timerHandle = setTimeout(function() {
                timerHandle = null;
                sampleSite(next_sample_site, siteList);
            }, deltaTime);
        }
    } else {
        // Either the monitor was stopped or another sample is in progress.
        // This could lead to a race condition or a drop-out.
        logger.error("SiteMonitor.queueNextSample logic error: another sample is in progress OR not sampling.");
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
        logger.info("Stopping SiteMonitor from /stop by " + request.get("referer") + " from " + request.ip);
        if (query.pass == configuration.shutdownpassword) {
            response.send("The STOP function has been invoked. Shutting down site-monitor.");
            SiteMonitor.stopMonitor();
        } else {
            response.send("You contacted the STOP endpoint.");
        }
    });
    app.get("/status", renderStatusPage);
    app.use(Express.static("./source/public", staticWebsiteOptions));
    app.listen(configuration.websiteport || 3399);
}

/**
 * Update the site configuration to initialize data sampling state. Validate and setup 
 * every site for sampling by initializing the records to a base condition.
 * @param {Array} siteList List of sites to sample.
 */
function initializeSiteSampling(siteList) {
    for (let siteIndex = 0; siteIndex < siteList.length; siteIndex ++) {
        let siteConfiguration = siteList[siteIndex];

        // site sample time is specified in seconds, convert that number to milliseconds.
        siteConfiguration.samplefrequency *= 1000;
        siteConfiguration.samplecount = 0;
        siteConfiguration.samplefailedcount = 0;
        siteConfiguration.sampleconsecutivefailedcount = 0;
        siteConfiguration.alerted = false;
        if (siteConfiguration.active) {
            siteConfiguration.next_sample_time = 1; // force each site to sample once at start up, and then go based on its sample timer // timeNow + siteConfiguration.samplefrequency;
        } else {
            siteConfiguration.next_sample_time = -1;
        }
    };
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
    let siteList = configuration.sites;
    globalEmailConfiguration = configuration.smtp || {};

    if (debugLogger) {
        logger = debugLogger;
    }
    initializeDatabase(configuration.database)
    .then(function() {
        initializeSiteSampling(siteList);
        updateSitesTable(siteList)
            .then(function() {
                logger.info("SiteMonitor has started on " + (new Date()).toUTCString());
                queueNextSample(siteList);
            })
            .catch(function(databaseError) {
                // Even if this update fails let's try to start the monitor anyway
                // TODO: Log this error
                logger.error("SiteMonitor caught updateSitesTable error " + databaseError.toString());
                logger.info("SiteMonitor has started on " + (new Date()).toUTCString());
                queueNextSample(siteList);
            });
    })
    .catch(function (databaseError) {
        logger.error("SiteMonitor caught initializeDatabase error " + databaseError.toString());
        logger.error(configuration.database);
        logger.info("SiteMonitor will start without logging to a database");
        logger.info("SiteMonitor has started on " + (new Date()).toUTCString());
        initializeSiteSampling(siteList);
        queueNextSample(siteList);
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
    logger.info("SiteMonitor stopping on " + (new Date()).toUTCString());
    stopped = true;
    if (timerHandle != null) {
        clearTimeout(timerHandle);
        timerHandle = null;
    }
    setTimeout(function() {
        process.exit(0);
    }, 1000);
};
