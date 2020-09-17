var Promise = require('promise');

function Scratch3ControlBlocks(runtime) {
    /**
     * The runtime instantiating this block package.
     * @type {Runtime}
     */
    this.runtime = runtime;
}

/**
 * Retrieve the block primitives implemented by this package.
 * @return {Object.<string, Function>} Mapping of opcode to Function.
 */
Scratch3ControlBlocks.prototype.getPrimitives = function() {
    return {
        'control_repeat': this.repeat,
        'control_forever': this.forever,
        'control_wait': this.wait,
        'control_if': this.if,
        'control_if_else': this.ifElse,
        'control_stop': this.stop
    };
};

Scratch3ControlBlocks.prototype.repeat = function(args, util) {
    // Initialize loop
    if (util.stackFrame.loopCounter === undefined) {
        util.stackFrame.loopCounter = parseInt(args.TIMES);
    }
    // Decrease counter
    util.stackFrame.loopCounter--;
    // If we still have some left, start the substack
    if (util.stackFrame.loopCounter >= 0) {
        util.startSubstack();
    }
};

Scratch3ControlBlocks.prototype.forever = function(args, util) {
    util.startSubstack();
};

Scratch3ControlBlocks.prototype.wait = function(args) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve();
        }, 1000 * args.DURATION);
    });
};

Scratch3ControlBlocks.prototype.if = function(args, util) {
    // Only execute one time. `if` will be returned to
    // when the substack finishes, but it shouldn't execute again.
    if (util.stackFrame.executed === undefined) {
        util.stackFrame.executed = true;
        if (args.CONDITION) {
            util.startSubstack();
        }
    }
};

Scratch3ControlBlocks.prototype.ifElse = function(args, util) {
    // Only execute one time. `ifElse` will be returned to
    // when the substack finishes, but it shouldn't execute again.
    if (util.stackFrame.executed === undefined) {
        util.stackFrame.executed = true;
        if (args.CONDITION) {
            util.startSubstack(1);
        } else {
            util.startSubstack(2);
        }
    }
};

Scratch3ControlBlocks.prototype.stop = function() {
    // @todo - don't use this.runtime
    this.runtime.stopAll();
};

module.exports = Scratch3ControlBlocks;
