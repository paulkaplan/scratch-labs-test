var path = require('path');
var test = require('tap').test;
var attachTestStorage = require('../fixtures/attach-test-storage');
var extract = require('../fixtures/extract');
var VirtualMachine = require('../../src/index');

var uri = path.resolve(__dirname, '../fixtures/procedure.sb2');
var project = extract(uri);

test('procedure', function (t) {
    var vm = new VirtualMachine();
    attachTestStorage(vm);

    // Evaluate playground data and exit
    vm.on('playgroundData', function (e) {
        var threads = JSON.parse(e.threads);
        t.ok(threads.length === 0);
        t.end();
        process.nextTick(process.exit);
    });

    // Start VM, load project, and run
    t.doesNotThrow(function () {
        vm.start();
        vm.clear();
        vm.setCompatibilityMode(false);
        vm.setTurboMode(false);
        vm.loadProject(project).then(function () {
            vm.greenFlag();

            // After two seconds, get playground data and stop
            setTimeout(function () {
                vm.getPlaygroundData();
                vm.stopAll();
            }, 2000);
        });
    });
});
