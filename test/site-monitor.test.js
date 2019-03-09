var siteMonitor = require("../source/site-monitor");

test('Expect site-monitor.js to exist and contain required functions', function() {
    expect(siteMonitor).toBeDefined();
    expect(siteMonitor.setConfiguration).toBeDefined();
    expect(siteMonitor.setConfiguration).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeDefined();
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.dynamicReset).toBeDefined();
    expect(siteMonitor.dynamicReset).toBeInstanceOf(Function);
    expect(siteMonitor.stopMonitor).toBeDefined();
    expect(siteMonitor.stopMonitor).toBeInstanceOf(Function);
});
