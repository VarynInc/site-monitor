/**
 * Site Monitor entry point.
 */
const Chalk = require("chalk");
const fs = require("fs");
const siteMonitor = require("./site-monitor");
const defaultConfigurationFile = "./source/configuration.json";


/**
 * Write a message to a log file.
 * @param {string} message The message to post in the log.
 */
function writeToLogFile(message) {
    if (configuration && configuration.logFile) {
        try {
            fs.appendFileSync(configuration.logFile, message + "\r\n");
        } catch (err) {
            console.log(Chalk.red("Error writing to " + configuration.logFile + ": " + err));
        }
    }
}

/**
 * Show an error message in the log and on the console but only if debugging is enabled.
 * @param {string} message A message to display.
 */
function errorLog(message) {
    if (debug) {
        console.log(Chalk.red(message));
        writeToLogFile(message);
    }
}

/**
 * Show an information message in the log and on the console but only if debugging is enabled.
 * @param {string} message A message to display.
 */
function debugLog(message) {
    if (debug) {
        console.log(Chalk.green(message));
        writeToLogFile(message);
    }
}

/**
 * Show a message in the log and on the console immediately.
 * @param {string} message A message to display.
 */
function immediateLog(message, error = true) {
    if (error) {
        console.log(Chalk.red(message));
    } else {
        console.log(Chalk.blue(message));
    }
    writeToLogFile(message);
}

/**
 * Overwrite any configuration options with values provided on the command line.
 * @return {object} Args object.
 */
function getArgs() {
    const args = require("yargs")
    .options({
        "config": {
            alias: "c",
            type: "string",
            describe: "path to config file",
            demandOption: false
        },
        "dbname": {
            alias: "d",
            type: "string",
            describe: "database schema",
            demandOption: false
        },
        "dbuser": {
            alias: "u",
            type: "string",
            describe: "database user account",
            demandOption: false
        },
        "dbpass": {
            alias: "p",
            type: "string",
            describe: "database user account password",
            demandOption: false
        },
        "dbhost": {
            alias: "h",
            type: "string",
            describe: "database host server",
            demandOption: false
        },
        "dbport": {
            alias: "n",
            type: "number",
            describe: "database host port",
            demandOption: false
        },
        "verbose": {
            alias: "v",
            type: "boolean",
            describe: "turn on debugging",
            demandOption: false,
            default: false
        },
    })
    .alias("?", "help")
    .help()
    .argv;
    return args;
}

/**
 * Load the required configuration information from a JSON file.
 * @param {string} configurationFilePath path to a configuration file.
 * @returns {object} The configuration data or an empty object if no data is available.
 */
function loadConfiguration(configurationFilePath) {
    if (fs.existsSync(configurationFilePath)) {
        let rawData = fs.readFileSync(configurationFilePath);
        if (rawData != null) {
            return JSON.parse(rawData) || {};  
        }
    }
    return {};
}

/**
 * Overwrite any configuration options with values provided on the command line.
 * Overwrite any configuration with environment variables if set.
 * Command line has precedence over config file, environment has precedence over both.
 * @param {object} args Command line arguments.
 * @param {object} configuration Default configuration information.
 * @return {object} Configuration information.
 */
function mergeArgs(args, configuration) {
    if ('DB_NAME' in Object.keys(process.env)) {
        configuration.database.database = process.env.DB_NAME;
    } else if (args.hasOwnProperty('dbname')) {
        configuration.database.database = args.dbname;
    }
    if ('DB_USER' in Object.keys(process.env)) {
        configuration.database.user = process.env.DB_USER;
    } else if (args.hasOwnProperty('dbuser')) {
        configuration.database.user = args.dbuser;
    }
    if ('DB_PASS' in Object.keys(process.env)) {
        configuration.database.password = process.env.DB_PASS;
    } else if (args.hasOwnProperty('dbpass')) {
        configuration.database.password = args.dbpass;
    }
    if ('DB_HOST' in Object.keys(process.env)) {
        configuration.database.host = process.env.DB_HOST;
    } else if (args.hasOwnProperty('dbhost')) {
        configuration.database.host = args.dbhost;
    }
    if ('DB_PORT' in Object.keys(process.env)) {
        configuration.database.port = process.env.DB_PORT;
    } else if (args.hasOwnProperty('dbport')) {
        configuration.database.port = args.dbport;
    }
    if (args.hasOwnProperty('verbose') && args.verbose) {
        configuration.verbose = args.verbose;
    }
    return configuration;
}

function initSiteMonitor() {
    const args = getArgs();
    let configurationFile = args.config || defaultConfigurationFile;
    if (configurationFile.length > 0) {
        configuration = loadConfiguration(configurationFile);
        if (Object.keys(configuration).length === 0) {
            immediateLog("Configuration file " + configurationFile + " does not exist or is not a valid format.");
        } else {
            immediateLog("Loading configuration from " + configurationFile, false);
        }
        mergeArgs(args, configuration);
        if (siteMonitor.setConfiguration(configuration)) {
            siteMonitor.startMonitor(configuration.sites);
            // wait indefinily until the app is terminated
            
        }
    }
}

initSiteMonitor();
