var EventEmitter = require('events');
var util = require('util');

var Runtime = require('./engine/runtime');
var sb2import = require('./import/sb2import');
var Sprite = require('./sprites/sprite');
var Blocks = require('./engine/blocks');

/**
 * Handles connections between blocks, stage, and extensions.
 *
 * @author Andrew Sliwinski <ascii@media.mit.edu>
 */
function VirtualMachine () {
    var instance = this;
    // Bind event emitter and runtime to VM instance
    EventEmitter.call(instance);
    /**
     * VM runtime, to store blocks, I/O devices, sprites/targets, etc.
     * @type {!Runtime}
     */
    instance.runtime = new Runtime();
    /**
     * The "currently editing"/selected target ID for the VM.
     * Block events from any Blockly workspace are routed to this target.
     * @type {!string}
     */
    instance.editingTarget = null;
    // Runtime emits are passed along as VM emits.
    instance.runtime.on(Runtime.SCRIPT_GLOW_ON, function (id) {
        instance.emit(Runtime.SCRIPT_GLOW_ON, {id: id});
    });
    instance.runtime.on(Runtime.SCRIPT_GLOW_OFF, function (id) {
        instance.emit(Runtime.SCRIPT_GLOW_OFF, {id: id});
    });
    instance.runtime.on(Runtime.BLOCK_GLOW_ON, function (id) {
        instance.emit(Runtime.BLOCK_GLOW_ON, {id: id});
    });
    instance.runtime.on(Runtime.BLOCK_GLOW_OFF, function (id) {
        instance.emit(Runtime.BLOCK_GLOW_OFF, {id: id});
    });
    instance.runtime.on(Runtime.VISUAL_REPORT, function (id, value) {
        instance.emit(Runtime.VISUAL_REPORT, {id: id, value: value});
    });

    this.blockListener = this.blockListener.bind(this);
    this.flyoutBlockListener = this.flyoutBlockListener.bind(this);
}

/**
 * Inherit from EventEmitter
 */
util.inherits(VirtualMachine, EventEmitter);

/**
 * Start running the VM - do this before anything else.
 */
VirtualMachine.prototype.start = function () {
    this.runtime.start();
};

/**
 * "Green flag" handler - start all threads starting with a green flag.
 */
VirtualMachine.prototype.greenFlag = function () {
    this.runtime.greenFlag();
};

/**
 * Set whether the VM is in "turbo mode."
 * When true, loops don't yield to redraw.
 * @param {Boolean} turboModeOn Whether turbo mode should be set.
 */
VirtualMachine.prototype.setTurboMode = function (turboModeOn) {
    this.runtime.turboMode = !!turboModeOn;
};

/**
 * Set whether the VM is in "pause mode."
 * When true, nothing is stepped.
 * @param {Boolean} pauseModeOn Whether pause mode should be set.
 */
VirtualMachine.prototype.setPauseMode = function (pauseModeOn) {
    this.runtime.setPauseMode(!!pauseModeOn);
};

/**
 * Set whether the VM is in 2.0 "compatibility mode."
 * When true, ticks go at 2.0 speed (30 TPS).
 * @param {Boolean} compatibilityModeOn Whether compatibility mode is set.
 */
VirtualMachine.prototype.setCompatibilityMode = function (compatibilityModeOn) {
    this.runtime.setCompatibilityMode(!!compatibilityModeOn);
};

/**
 * Set whether the VM is in "single stepping mode."
 * When true, blocks execute slowly and are highlighted visually.
 * @param {Boolean} singleSteppingOn Whether single-stepping mode is set.
 */
VirtualMachine.prototype.setSingleSteppingMode = function (singleSteppingOn) {
    this.runtime.setSingleSteppingMode(!!singleSteppingOn);
};


/**
 * Set single-stepping mode speed.
 * When in single-stepping mode, adjusts the speed of execution.
 * @param {Number} speed Interval length in ms.
 */
VirtualMachine.prototype.setSingleSteppingSpeed = function (speed) {
    this.runtime.setSingleSteppingSpeed(speed);
};


/**
 * Stop all threads and running activities.
 */
VirtualMachine.prototype.stopAll = function () {
    this.runtime.stopAll();
};

/**
 * Clear out current running project data.
 */
VirtualMachine.prototype.clear = function () {
    this.runtime.dispose();
    this.editingTarget = null;
    this.emitTargetsUpdate();
};

/**
 * Get data for playground. Data comes back in an emitted event.
 */
VirtualMachine.prototype.getPlaygroundData = function () {
    var instance = this;
    // Only send back thread data for the current editingTarget.
    var threadData = this.runtime.threads.filter(function(thread) {
        return thread.target == instance.editingTarget;
    });
    // Remove the target key, since it's a circular reference.
    var filteredThreadData = JSON.stringify(threadData, function(key, value) {
        if (key == 'target') return undefined;
        return value;
    }, 2);
    this.emit('playgroundData', {
        blocks: this.editingTarget.blocks,
        threads: filteredThreadData
    });
};

/**
 * Handle an animation frame.
 */
VirtualMachine.prototype.animationFrame = function () {
    this.runtime.animationFrame();
};

/**
 * Post I/O data to the virtual devices.
 * @param {?string} device Name of virtual I/O device.
 * @param {Object} data Any data object to post to the I/O device.
 */
VirtualMachine.prototype.postIOData = function (device, data) {
    if (this.runtime.ioDevices[device]) {
        this.runtime.ioDevices[device].postData(data);
    }
};

/**
 * Load a project from a Scratch 2.0 JSON representation.
 * @param {?string} json JSON string representing the project.
 */
VirtualMachine.prototype.loadProject = function (json) {
    this.clear();
    // @todo: Handle other formats, e.g., Scratch 1.4, Scratch 3.0.
    sb2import(json, this.runtime);
    // Select the first target for editing, e.g., the stage.
    this.editingTarget = this.runtime.targets[0];
    // Update the VM user's knowledge of targets and blocks on the workspace.
    this.emitTargetsUpdate();
    this.emitWorkspaceUpdate();
    this.runtime.setEditingTarget(this.editingTarget);
};

/**
 * Temporary way to make an empty project, in case the desired project
 * cannot be loaded from the online server.
 */
VirtualMachine.prototype.createEmptyProject = function () {
    // Stage.
    var blocks2 = new Blocks();
    var stage = new Sprite(blocks2, this.runtime);
    stage.name = 'Stage';
    stage.costumes.push({
        skin: './assets/stage.png',
        name: 'backdrop1',
        bitmapResolution: 2,
        rotationCenterX: 480,
        rotationCenterY: 360
    });
    var target2 = stage.createClone();
    this.runtime.targets.push(target2);
    target2.x = 0;
    target2.y = 0;
    target2.direction = 90;
    target2.size = 200;
    target2.visible = true;
    target2.isStage = true;
    // Sprite1 (cat).
    var blocks1 = new Blocks();
    var sprite = new Sprite(blocks1, this.runtime);
    sprite.name = 'Sprite1';
    sprite.costumes.push({
        skin: './assets/scratch_cat.svg',
        name: 'costume1',
        bitmapResolution: 1,
        rotationCenterX: 47,
        rotationCenterY: 55
    });
    var target1 = sprite.createClone();
    this.runtime.targets.push(target1);
    target1.x = 0;
    target1.y = 0;
    target1.direction = 90;
    target1.size = 100;
    target1.visible = true;
    this.editingTarget = this.runtime.targets[0];
    this.emitTargetsUpdate();
    this.emitWorkspaceUpdate();
};

/**
 * Set the renderer for the VM/runtime
 * @param {!RenderWebGL} renderer The renderer to attach
 */
VirtualMachine.prototype.attachRenderer = function (renderer) {
    this.runtime.attachRenderer(renderer);
};

/**
 * Handle a Blockly event for the current editing target.
 * @param {!Blockly.Event} e Any Blockly event.
 */
VirtualMachine.prototype.blockListener = function (e) {
    if (this.editingTarget) {
        this.editingTarget.blocks.blocklyListen(e, this.runtime);
    }
};

/**
 * Handle a Blockly event for the flyout.
 * @param {!Blockly.Event} e Any Blockly event.
 */
VirtualMachine.prototype.flyoutBlockListener = function (e) {
    this.runtime.flyoutBlocks.blocklyListen(e, this.runtime);
};

/**
 * Set an editing target. An editor UI can use this function to switch
 * between editing different targets, sprites, etc.
 * After switching the editing target, the VM may emit updates
 * to the list of targets and any attached workspace blocks
 * (see `emitTargetsUpdate` and `emitWorkspaceUpdate`).
 * @param {string} targetId Id of target to set as editing.
 */
VirtualMachine.prototype.setEditingTarget = function (targetId) {
    // Has the target id changed? If not, exit.
    if (targetId == this.editingTarget.id) {
        return;
    }
    var target = this.runtime.getTargetById(targetId);
    if (target) {
        this.editingTarget = target;
        // Emit appropriate UI updates.
        this.emitTargetsUpdate();
        this.emitWorkspaceUpdate();
        this.runtime.setEditingTarget(target);
    }
};

/**
 * Emit metadata about available targets.
 * An editor UI could use this to display a list of targets and show
 * the currently editing one.
 */
VirtualMachine.prototype.emitTargetsUpdate = function () {
    this.emit('targetsUpdate', {
        // [[target id, human readable target name], ...].
        targetList: this.runtime.targets.filter(function (target) {
            // Don't report clones.
            return !target.hasOwnProperty('isOriginal') || target.isOriginal;
        }).map(function(target) {
            return [target.id, target.getName()];
        }),
        // Currently editing target id.
        editingTarget: this.editingTarget ? this.editingTarget.id : null
    });
};

/**
 * Emit an Blockly/scratch-blocks compatible XML representation
 * of the current editing target's blocks.
 */
VirtualMachine.prototype.emitWorkspaceUpdate = function () {
    this.emit('workspaceUpdate', {
        'xml': this.editingTarget.blocks.toXML()
    });
};

module.exports = VirtualMachine;
