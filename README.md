# Site Monitor

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Nodejs app to monitor sites and alert if they are not abiding by their normal operating condition.

## Installation

`npm install` will install the dependencies.

## Configuration

The sample `configuration-template.json` contains all available configuration options
so we won't go over them all here. It should be self-evident but if not we will update this documentation. Rename/copy
`configuration-template.json` to `configuration.json` and set it up for your requirements.

You should have a database connection. It's not required, but saving samples to a persistent storage
is pretty much a requirement for this app. If you use a database, it must exist. The app will
create the tables if it needs to, but it will not create a database.

Edit `source/configuration.json` with your database connection information and your site definitions. Be sure the
user account has the necessary database privileges granted.

Set `websiteport` to the port you want to run the web server on (default is 3399). This is for in-bound connections to
view the stats and operation of the site monitor (the site monitor will handle out-bound requests on
ports 80 or 443 according to your configuration.)

If the configuration changes the service must be restarted to read the updated configuration.

## Operation

`npm start` will run the monitor and the web server. You can also start the service by running `node source/index.js` on the command line.

The web server will run from the port you set in the configuration:

```
http://your-site-monitor-host:3399/
```

The web server will serve any static file from your `./source/public` folder.

There is an end point there to stop the server. You need to supply the password you set in your configuration file.

```
http://your-site-monitor-host:3399/stop?pass=your-password
```

## Deployment

Package and deploy as a Node.js app.

Outbound http port 80 must be enabled. Also must allow the database connection based on your configuration.

Inbound http must be enabled on the port you configured if you want access to the static website.

## License

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)

## Contributing

This is open source software. [Create issues](https://github.com/VarynInc/site-monitor/issues), fork the repo, issue a [pull request](https://github.com/VarynInc/site-monitor/pulls).

## About

This is a bit of a labor of love for me. When I worked at Skyworks back around 1999-2000 I needed to monitor
many of the sites we were responsible for. There was nothing available back then and our business relied on
us knowing how well the sites were performing and to alert us when something went wrong. I built the initial
SiteMon project in C++ using MFC and ran it as a Windows app. Samples were stored in an SQL Server database
such that the data could be aggregated from multiple independent computers sampling the sites and providing
redundancy. The last build date was 2002 and the app still runs on Windows 10!

![Original SiteMon Windows app](assets/sitemon.jpg)

Fast forward to today and that old code and workfrow really doesn't work for where things are at today. I
initially thought I was going to port my original app, but after looking at it for a few minutes realized this
was going to be a rewrite. Node.js really provides the necessary tools to do this rather easily. That's not to
say this is an easy app, but doing it with Node is way better than MFC!
