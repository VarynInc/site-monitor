const Request = require("request");
let timerHandle = null;
let sampleInProgress = false;
let stopped = false;
let sleepTime = 500;
let sleepCounter = 0;

SiteMonitor = exports;

/**
 * Create the database schema only if it does not already exist.
 */
function createDatabase(databaseConfiguration) {
    // sample-id
    // sample-type (sample, hourly, daily, weekly, monthly)
    // sample-timestamp
    // sample-url-id
    // status code (200, etc)
    // error code (succeeded, failed to find token, timeout, response time exceeded)
    // response time
    // message
}

/**
 * Consolidate samples. This merges old records into aggregate samples.
 * Samples older than 1 month get merged into monthly samples by month
 * Samples older than 7 days get merged into weekly samples by week
 * Samples older than 1 day get merged into daily samples
 * Samples older than 1 hour get merged into hourly samples and the individual samples get deleted.
 */
function consolidateDatabase(databaseConfiguration) {

}

function recordSampleError(siteConfiguration, responseTime, error) {
    console.log("recordSampleError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleStatusError(siteConfiguration, responseTime, statusCode) {
    console.log("recordSampleStatusError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleTokenFailError(siteConfiguration, responseTime) {
    console.log("recordSampleTokenFailError for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleErrorThresholdExceeded(siteConfiguration, responseTime) {
    console.log("recordSampleErrorThresholdExceeded for " + siteConfiguration.sitename + ": " + siteConfiguration.sampleurl);
}

function recordSampleSuccess(siteConfiguration, responseTime) {
    console.log("recordSampleSuccess for " + siteConfiguration.sitename);
}

/**
 * Conduct a sample given the site definition (from the configuration.) This is asynchronous:
 * a Promise is returned that will resolve once the sample is complete.
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
            // TODO: log this error message
            queueNextSample(siteList);
        })
        .catch (function(exception) {
            sampleInProgress = false;
            // TODO: log this exception
            queueNextSample(siteList);
        });
}

/**
 * This function scans the list of all active sites and determines the next site to sample.
 * Either a site's next sample time has passed, in which case we sample it immediately, or
 * a site's sample time is somewhere in the future and we find the nearest site's time and
 * wait until then. Once a site is ampled, this function is called again to determine the next site.
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
        // TODO: log this condition
    }
}

/**
 * Set the configuration object.
 * @param {object} configuration Configuration object.
 */
SiteMonitor.setConfiguration = function(configuration) {
    createDatabase(configuration.database);
    return true;
};

/**
 * Reset the configuration on the fly, leaving the monitor running
 * while adding or removing site to monitor.
 * @param {object} configuration Configuration object.
 */
SiteMonitor.dynamicReset = function(configuration) {

};

/**
 * Start monitoring all sites and let it run until requested to stop.
 */
SiteMonitor.startMonitor = async function(siteList) {
    let timenow = Date.now();

    // setup every site for sampling by initializing the records to a base condition.
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
    queueNextSample(siteList);

    let sleeper = function (sleepTime) {
        return new Promise(function (resolve, reject) {
            if ( ! stopped) {
                setTimeout(resolve, sleepTime);
            } else {
                reject(null);
            }
        });
    };
    while ( ! stopped) {
        await sleeper(sleepTime).then(() => {
            // TODO: log or monitor operations on each interval?
            sleepCounter ++;
        })
        .catch(function(error) {
            // TODO: message exit
            console.log("We're done!");
        });
    }
};

/**
 * Stop monitoring.
 */
SiteMonitor.stopMonitor = function() {
    stopped = true;
    if (timerHandle != null) {
        clearTimeout(timerHandle);
        timerHandle = null;
    }
};
