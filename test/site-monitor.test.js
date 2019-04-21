/**
 * Test the expected operation of the site-monitor.js functionality.
 */

var siteMonitor = require("../source/site-monitor");

test('Expect site-monitor.js to exist and contain required functions', function() {
    expect(siteMonitor).toBeDefined();
    expect(siteMonitor.startMonitor).toBeDefined();
    expect(siteMonitor.startMonitor).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeDefined();
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeDefined();
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.stopMonitor).toBeDefined();
    expect(siteMonitor.stopMonitor).toBeInstanceOf(Function);
});
