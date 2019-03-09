var siteMonitor = require("../source/index");

test('Expect index.js to exist and contain required functions', function() {
    expect(initSiteMonitor).toBeInstanceOf(Function);
});

test('Expect getArgs to function to specs', function() {
    expect(getArgs).toBeInstanceOf(Function);
});

test('Expect mergeArgs to function to specs', function() {
    expect(mergeArgs).toBeInstanceOf(Function);
});

test('Expect loadConfiguration to function to specs', function() {
    expect(loadConfiguration).toBeInstanceOf(Function);
});
