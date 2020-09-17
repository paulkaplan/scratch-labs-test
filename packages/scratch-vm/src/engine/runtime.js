var EventEmitter = require('events');
var Sequencer = require('./sequencer');
var Blocks = require('./blocks');
var Thread = require('./thread');
var util = require('util');

// Virtual I/O devices.
var Clock = require('../io/clock');
var Keyboard = require('../io/keyboard');
var Mouse = require('../io/mouse');

var defaultBlockPackages = {
    'scratch3_control': require('../blocks/scratch3_control'),
    'scratch3_event': require('../blocks/scratch3_event'),
    'scratch3_looks': require('../blocks/scratch3_looks'),
    'scratch3_motion': require('../blocks/scratch3_motion'),
    'scratch3_operators': require('../blocks/scratch3_operators'),
    'scratch3_sensing': require('../blocks/scratch3_sensing'),
    'scratch3_data': require('../blocks/scratch3_data'),
    'scratch3_procedures': require('../blocks/scratch3_procedures')
};

/**
 * Manages targets, scripts, and the sequencer.
 */
function Runtime () {
    // Bind event emitter
    EventEmitter.call(this);

    // State for the runtime

    /**
     * Target management and storage.
     * @type {Array.<!Target>}
     */
    this.targets = [];

    /**
     * A list of threads that are currently running in the VM.
     * Threads are added when execution starts and pruned when execution ends.
     * @type {Array.<Thread>}
     */
    this.threads = [];

    /** @type {!Sequencer} */
    this.sequencer = new Sequencer(this);

    this.flyoutBlocks = new Blocks();

    /**
     * Map to look up a block primitive's implementation function by its opcode.
     * This is a two-step lookup: package name first, then primitive name.
     * @type {Object.<string, Function>}
     */
    this._primitives = {};
    this._hats = {};
    this._edgeActivatedHatValues = {};
    this._registerBlockPackages();

    this.ioDevices = {
        'clock': new Clock(),
        'keyboard': new Keyboard(this),
        'mouse': new Mouse(this)
    };

    this._scriptGlowsPreviousFrame = [];
    this._editingTarget = null;
    /**
     * Currently known number of clones.
     * @type {number}
     */
    this._cloneCounter = 0;
}

/**
 * Width of the stage, in pixels.
 * @const {number}
 */
Runtime.STAGE_WIDTH = 480;

/**
 * Height of the stage, in pixels.
 * @const {number}
 */
Runtime.STAGE_HEIGHT = 360;

/**
 * Event name for glowing a script.
 * @const {string}
 */
Runtime.SCRIPT_GLOW_ON = 'STACK_GLOW_ON';

/**
 * Event name for unglowing a script.
 * @const {string}
 */
Runtime.SCRIPT_GLOW_OFF = 'STACK_GLOW_OFF';

/**
 * Event name for glowing a block.
 * @const {string}
 */
Runtime.BLOCK_GLOW_ON = 'BLOCK_GLOW_ON';

/**
 * Event name for unglowing a block.
 * @const {string}
 */
Runtime.BLOCK_GLOW_OFF = 'BLOCK_GLOW_OFF';

/**
 * Event name for visual value report.
 * @const {string}
 */
Runtime.VISUAL_REPORT = 'VISUAL_REPORT';

/**
 * Inherit from EventEmitter
 */
util.inherits(Runtime, EventEmitter);

/**
 * How rapidly we try to step threads, in ms.
 */
Runtime.THREAD_STEP_INTERVAL = 1000 / 60;

/**
 * How many clones can be created at a time.
 * @const {number}
 */
Runtime.MAX_CLONES = 300;

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Register default block packages with this runtime.
 * @todo Prefix opcodes with package name.
 * @private
 */
Runtime.prototype._registerBlockPackages = function () {
    for (var packageName in defaultBlockPackages) {
        if (defaultBlockPackages.hasOwnProperty(packageName)) {
            // @todo pass a different runtime depending on package privilege?
            var packageObject = new (defaultBlockPackages[packageName])(this);
            // Collect primitives from package.
            if (packageObject.getPrimitives) {
                var packagePrimitives = packageObject.getPrimitives();
                for (var op in packagePrimitives) {
                    if (packagePrimitives.hasOwnProperty(op)) {
                        this._primitives[op] =
                            packagePrimitives[op].bind(packageObject);
                    }
                }
            }
            // Collect hat metadata from package.
            if (packageObject.getHats) {
                var packageHats = packageObject.getHats();
                for (var hatName in packageHats) {
                    if (packageHats.hasOwnProperty(hatName)) {
                        this._hats[hatName] = packageHats[hatName];
                    }
                }
            }
        }
    }
};

/**
 * Retrieve the function associated with the given opcode.
 * @param {!string} opcode The opcode to look up.
 * @return {Function} The function which implements the opcode.
 */
Runtime.prototype.getOpcodeFunction = function (opcode) {
    return this._primitives[opcode];
};

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Return whether an opcode represents a hat block.
 * @param {!string} opcode The opcode to look up.
 * @return {Boolean} True if the op is known to be a hat.
 */
Runtime.prototype.getIsHat = function (opcode) {
    return this._hats.hasOwnProperty(opcode);
};

/**
 * Return whether an opcode represents an edge-activated hat block.
 * @param {!string} opcode The opcode to look up.
 * @return {Boolean} True if the op is known to be a edge-activated hat.
 */
Runtime.prototype.getIsEdgeActivatedHat = function (opcode) {
    return this._hats.hasOwnProperty(opcode) &&
        this._hats[opcode].edgeActivated;
};

/**
 * Update an edge-activated hat block value.
 * @param {!string} blockId ID of hat to store value for.
 * @param {*} newValue Value to store for edge-activated hat.
 * @return {*} The old value for the edge-activated hat.
 */
Runtime.prototype.updateEdgeActivatedValue = function (blockId, newValue) {
    var oldValue = this._edgeActivatedHatValues[blockId];
    this._edgeActivatedHatValues[blockId] = newValue;
    return oldValue;
};

/**
 * Clear all edge-activaed hat values.
 */
Runtime.prototype.clearEdgeActivatedValues = function () {
    this._edgeActivatedHatValues = {};
};

/**
 * Attach the renderer
 * @param {!RenderWebGL} renderer The renderer to attach
 */
Runtime.prototype.attachRenderer = function (renderer) {
    this.renderer = renderer;
};

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Create a thread and push it to the list of threads.
 * @param {!string} id ID of block that starts the stack.
 * @param {!Target} target Target to run thread on.
 * @return {!Thread} The newly created thread.
 */
Runtime.prototype._pushThread = function (id, target) {
    var thread = new Thread(id);
    thread.setTarget(target);
    thread.pushStack(id);
    this.threads.push(thread);
    return thread;
};

/**
 * Remove a thread from the list of threads.
 * @param {?Thread} thread Thread object to remove from actives
 */
Runtime.prototype._removeThread = function (thread) {
    // Inform sequencer to stop executing that thread.
    this.sequencer.retireThread(thread);
    // Remove from the list.
    var i = this.threads.indexOf(thread);
    if (i > -1) {
        this.threads.splice(i, 1);
    }
};

/**
 * Return whether a thread is currently active/running.
 * @param {?Thread} thread Thread object to check.
 * @return {Boolean} True if the thread is active/running.
 */
Runtime.prototype.isActiveThread = function (thread) {
    return this.threads.indexOf(thread) > -1;
};

/**
 * Toggle a script.
 * @param {!string} topBlockId ID of block that starts the script.
 */
Runtime.prototype.toggleScript = function (topBlockId) {
    // Remove any existing thread.
    for (var i = 0; i < this.threads.length; i++) {
        if (this.threads[i].topBlock == topBlockId) {
            this._removeThread(this.threads[i]);
            return;
        }
    }
    // Otherwise add it.
    this._pushThread(topBlockId, this._editingTarget);
};

/**
 * Run a function `f` for all scripts in a workspace.
 * `f` will be called with two parameters:
 *  - the top block ID of the script.
 *  - the target that owns the script.
 * @param {!Function} f Function to call for each script.
 * @param {Target=} opt_target Optionally, a target to restrict to.
 */
Runtime.prototype.allScriptsDo = function (f, opt_target) {
    var targets = this.targets;
    if (opt_target) {
        targets = [opt_target];
    }
    for (var t = 0; t < targets.length; t++) {
        var target = targets[t];
        var scripts = target.blocks.getScripts();
        for (var j = 0; j < scripts.length; j++) {
            var topBlockId = scripts[j];
            f(topBlockId, target);
        }
    }
};

/**
 * Start all relevant hats.
 * @param {!string} requestedHatOpcode Opcode of hats to start.
 * @param {Object=} opt_matchFields Optionally, fields to match on the hat.
 * @param {Target=} opt_target Optionally, a target to restrict to.
 * @return {Array.<Thread>} List of threads started by this function.
 */
Runtime.prototype.startHats = function (requestedHatOpcode,
    opt_matchFields, opt_target) {
    if (!this._hats.hasOwnProperty(requestedHatOpcode)) {
        // No known hat with this opcode.
        return;
    }
    var instance = this;
    var newThreads = [];
    // Consider all scripts, looking for hats with opcode `requestedHatOpcode`.
    this.allScriptsDo(function(topBlockId, target) {
        var potentialHatOpcode = target.blocks.getBlock(topBlockId).opcode;
        if (potentialHatOpcode !== requestedHatOpcode) {
            // Not the right hat.
            return;
        }
        // Match any requested fields.
        // For example: ensures that broadcasts match.
        // This needs to happen before the block is evaluated
        // (i.e., before the predicate can be run) because "broadcast and wait"
        // needs to have a precise collection of started threads.
        var hatFields = target.blocks.getFields(topBlockId);
        if (opt_matchFields) {
            for (var matchField in opt_matchFields) {
                if (hatFields[matchField].value !==
                    opt_matchFields[matchField]) {
                    // Field mismatch.
                    return;
                }
            }
        }
        // Look up metadata for the relevant hat.
        var hatMeta = instance._hats[requestedHatOpcode];
        if (hatMeta.restartExistingThreads) {
            // If `restartExistingThreads` is true, we should stop
            // any existing threads starting with the top block.
            for (var i = 0; i < instance.threads.length; i++) {
                if (instance.threads[i].topBlock === topBlockId &&
                    instance.threads[i].target == target) {
                    instance._removeThread(instance.threads[i]);
                }
            }
        } else {
            // If `restartExistingThreads` is false, we should
            // give up if any threads with the top block are running.
            for (var j = 0; j < instance.threads.length; j++) {
                if (instance.threads[j].topBlock === topBlockId &&
                    instance.threads[j].target == target) {
                    // Some thread is already running.
                    return;
                }
            }
        }
        // Start the thread with this top block.
        newThreads.push(instance._pushThread(topBlockId, target));
    }, opt_target);
    return newThreads;
};

/**
 * Dispose all targets. Return to clean state.
 */
Runtime.prototype.dispose = function () {
    this.stopAll();
    this.targets.map(this.disposeTarget, this);
};

/**
 * Dispose of a target.
 * @param {!Target} disposingTarget Target to dispose of.
 */
Runtime.prototype.disposeTarget = function (disposingTarget) {
    this.targets = this.targets.filter(function (target) {
        if (disposingTarget !== target) return true;
        // Allow target to do dispose actions.
        target.dispose();
        // Remove from list of targets.
        return false;
    });
};

/**
 * Stop any threads acting on the target.
 * @param {!Target} target Target to stop threads for.
 * @param {Thread=} opt_threadException Optional thread to skip.
 */
Runtime.prototype.stopForTarget = function (target, opt_threadException) {
    // Stop any threads on the target.
    for (var i = 0; i < this.threads.length; i++) {
        if (this.threads[i] === opt_threadException) {
            continue;
        }
        if (this.threads[i].target == target) {
            this._removeThread(this.threads[i]);
        }
    }
};

/**
 * Start all threads that start with the green flag.
 */
Runtime.prototype.greenFlag = function () {
    this.stopAll();
    this.ioDevices.clock.resetProjectTimer();
    this.clearEdgeActivatedValues();
    // Inform all targets of the green flag.
    for (var i = 0; i < this.targets.length; i++) {
        this.targets[i].onGreenFlag();
    }
    this.startHats('event_whenflagclicked');
};

/**
 * Stop "everything."
 */
Runtime.prototype.stopAll = function () {
    // Dispose all clones.
    var newTargets = [];
    for (var i = 0; i < this.targets.length; i++) {
        if (this.targets[i].hasOwnProperty('isOriginal') &&
            !this.targets[i].isOriginal) {
            this.targets[i].dispose();
        } else {
            newTargets.push(this.targets[i]);
        }
    }
    this.targets = newTargets;
    // Dispose all threads.
    var threadsCopy = this.threads.slice();
    while (threadsCopy.length > 0) {
        var poppedThread = threadsCopy.pop();
        this._removeThread(poppedThread);
    }
};

/**
 * Repeatedly run `sequencer.stepThreads` and filter out
 * inactive threads after each iteration.
 */
Runtime.prototype._step = function () {
    // Find all edge-activated hats, and add them to threads to be evaluated.
    for (var hatType in this._hats) {
        var hat = this._hats[hatType];
        if (hat.edgeActivated) {
            this.startHats(hatType);
        }
    }
    var inactiveThreads = this.sequencer.stepThreads(this.threads);
    this._updateScriptGlows();
    for (var i = 0; i < inactiveThreads.length; i++) {
        this._removeThread(inactiveThreads[i]);
    }
};

Runtime.prototype.setEditingTarget = function (editingTarget) {
    this._scriptGlowsPreviousFrame = [];
    this._editingTarget = editingTarget;
    this._updateScriptGlows();
};

Runtime.prototype._updateScriptGlows = function () {
    // Set of scripts that request a glow this frame.
    var requestedGlowsThisFrame = [];
    // Final set of scripts glowing during this frame.
    var finalScriptGlows = [];
    // Find all scripts that should be glowing.
    for (var i = 0; i < this.threads.length; i++) {
        var thread = this.threads[i];
        var target = thread.target;
        if (thread.requestScriptGlowInFrame && target == this._editingTarget) {
            var blockForThread = thread.peekStack() || thread.topBlock;
            var script = target.blocks.getTopLevelScript(blockForThread);
            if (!script) {
                // Attempt to find in flyout blocks.
                script = this.flyoutBlocks.getTopLevelScript(blockForThread);
            }
            if (script) {
                requestedGlowsThisFrame.push(script);
            }
        }
    }
    // Compare to previous frame.
    for (var j = 0; j < this._scriptGlowsPreviousFrame.length; j++) {
        var previousFrameGlow = this._scriptGlowsPreviousFrame[j];
        if (requestedGlowsThisFrame.indexOf(previousFrameGlow) < 0) {
            // Glow turned off.
            this.glowScript(previousFrameGlow, false);
        } else {
            // Still glowing.
            finalScriptGlows.push(previousFrameGlow);
        }
    }
    for (var k = 0; k < requestedGlowsThisFrame.length; k++) {
        var currentFrameGlow = requestedGlowsThisFrame[k];
        if (this._scriptGlowsPreviousFrame.indexOf(currentFrameGlow) < 0) {
            // Glow turned on.
            this.glowScript(currentFrameGlow, true);
            finalScriptGlows.push(currentFrameGlow);
        }
    }
    this._scriptGlowsPreviousFrame = finalScriptGlows;
};

/**
 * "Quiet" a script's glow: stop the VM from generating glow/unglow events
 * about that script. Use when a script has just been deleted, but we may
 * still be tracking glow data about it.
 * @param {!string} scriptBlockId Id of top-level block in script to quiet.
 */
Runtime.prototype.quietGlow = function (scriptBlockId) {
    var index = this._scriptGlowsPreviousFrame.indexOf(scriptBlockId);
    if (index > -1) {
        this._scriptGlowsPreviousFrame.splice(index, 1);
    }
};

/**
 * Emit feedback for block glowing (used in the sequencer).
 * @param {?string} blockId ID for the block to update glow
 * @param {boolean} isGlowing True to turn on glow; false to turn off.
 */
Runtime.prototype.glowBlock = function (blockId, isGlowing) {
    if (isGlowing) {
        this.emit(Runtime.BLOCK_GLOW_ON, blockId);
    } else {
        this.emit(Runtime.BLOCK_GLOW_OFF, blockId);
    }
};

/**
 * Emit feedback for script glowing.
 * @param {?string} topBlockId ID for the top block to update glow
 * @param {boolean} isGlowing True to turn on glow; false to turn off.
 */
Runtime.prototype.glowScript = function (topBlockId, isGlowing) {
    if (isGlowing) {
        this.emit(Runtime.SCRIPT_GLOW_ON, topBlockId);
    } else {
        this.emit(Runtime.SCRIPT_GLOW_OFF, topBlockId);
    }
};

/**
 * Emit value for reporter to show in the blocks.
 * @param {string} blockId ID for the block.
 * @param {string} value Value to show associated with the block.
 */
Runtime.prototype.visualReport = function (blockId, value) {
    this.emit(Runtime.VISUAL_REPORT, blockId, String(value));
};

/**
 * Get a target by its id.
 * @param {string} targetId Id of target to find.
 * @return {?Target} The target, if found.
 */
Runtime.prototype.getTargetById = function (targetId) {
    for (var i = 0; i < this.targets.length; i++) {
        var target = this.targets[i];
        if (target.id == targetId) {
            return target;
        }
    }
};

/**
 * Get the first original (non-clone-block-created) sprite given a name.
 * @param {string} spriteName Name of sprite to look for.
 * @return {?Target} Target representing a sprite of the given name.
 */
Runtime.prototype.getSpriteTargetByName = function (spriteName) {
    for (var i = 0; i < this.targets.length; i++) {
        var target = this.targets[i];
        if (target.sprite && target.sprite.name == spriteName) {
            return target;
        }
    }
};

/**
 * Update the clone counter to track how many clones are created.
 * @param {number} changeAmount How many clones have been created/destroyed.
 */
Runtime.prototype.changeCloneCounter = function (changeAmount) {
    this._cloneCounter += changeAmount;
};

/**
 * Return whether there are clones available.
 * @return {boolean} True until the number of clones hits Runtime.MAX_CLONES.
 */
Runtime.prototype.clonesAvailable = function () {
    return this._cloneCounter < Runtime.MAX_CLONES;
};

/**
 * Get a target representing the Scratch stage, if one exists.
 * @return {?Target} The target, if found.
 */
Runtime.prototype.getTargetForStage = function () {
    for (var i = 0; i < this.targets.length; i++) {
        var target = this.targets[i];
        if (target.isStage) {
            return target;
        }
    }
};

/**
 * Handle an animation frame from the main thread.
 */
Runtime.prototype.animationFrame = function () {
    if (this.renderer) {
        this.renderer.draw();
    }
};

/**
 * Set up timers to repeatedly step in a browser
 */
Runtime.prototype.start = function () {
    self.setInterval(function() {
        this._step();
    }.bind(this), Runtime.THREAD_STEP_INTERVAL);
};

module.exports = Runtime;
