const EventEmitter = require('events');

const log = require('./util/log');
const Runtime = require('./engine/runtime');
const sb2import = require('./import/sb2import');
const StringUtil = require('./util/string-util');

const loadCostume = require('./import/load-costume.js');
const loadSound = require('./import/load-sound.js');

const RESERVED_NAMES = ['_mouse_', '_stage_', '_edge_', '_myself_', '_random_'];

/**
 * Handles connections between blocks, stage, and extensions.
 * @constructor
 */
class VirtualMachine extends EventEmitter {
    constructor () {
        super();

        const instance = this;
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
        instance.runtime.on(Runtime.SCRIPT_GLOW_ON, glowData => {
            instance.emit(Runtime.SCRIPT_GLOW_ON, glowData);
        });
        instance.runtime.on(Runtime.SCRIPT_GLOW_OFF, glowData => {
            instance.emit(Runtime.SCRIPT_GLOW_OFF, glowData);
        });
        instance.runtime.on(Runtime.BLOCK_GLOW_ON, glowData => {
            instance.emit(Runtime.BLOCK_GLOW_ON, glowData);
        });
        instance.runtime.on(Runtime.BLOCK_GLOW_OFF, glowData => {
            instance.emit(Runtime.BLOCK_GLOW_OFF, glowData);
        });
        instance.runtime.on(Runtime.PROJECT_RUN_START, () => {
            instance.emit(Runtime.PROJECT_RUN_START);
        });
        instance.runtime.on(Runtime.PROJECT_RUN_STOP, () => {
            instance.emit(Runtime.PROJECT_RUN_STOP);
        });
        instance.runtime.on(Runtime.VISUAL_REPORT, visualReport => {
            instance.emit(Runtime.VISUAL_REPORT, visualReport);
        });
        instance.runtime.on(Runtime.SPRITE_INFO_REPORT, spriteInfo => {
            instance.emit(Runtime.SPRITE_INFO_REPORT, spriteInfo);
        });

        this.blockListener = this.blockListener.bind(this);
        this.flyoutBlockListener = this.flyoutBlockListener.bind(this);
    }

    /**
     * Start running the VM - do this before anything else.
     */
    start () {
        this.runtime.start();
    }

    /**
     * "Green flag" handler - start all threads starting with a green flag.
     */
    greenFlag () {
        this.runtime.greenFlag();
    }

    /**
     * Set whether the VM is in "turbo mode."
     * When true, loops don't yield to redraw.
     * @param {boolean} turboModeOn Whether turbo mode should be set.
     */
    setTurboMode (turboModeOn) {
        this.runtime.turboMode = !!turboModeOn;
    }

    /**
     * Set whether the VM is in 2.0 "compatibility mode."
     * When true, ticks go at 2.0 speed (30 TPS).
     * @param {boolean} compatibilityModeOn Whether compatibility mode is set.
     */
    setCompatibilityMode (compatibilityModeOn) {
        this.runtime.setCompatibilityMode(!!compatibilityModeOn);
    }

    /**
     * Stop all threads and running activities.
     */
    stopAll () {
        this.runtime.stopAll();
    }

    /**
     * Clear out current running project data.
     */
    clear () {
        this.runtime.dispose();
        this.editingTarget = null;
        this.emitTargetsUpdate();
    }

    /**
     * Get data for playground. Data comes back in an emitted event.
     */
    getPlaygroundData () {
        const instance = this;
        // Only send back thread data for the current editingTarget.
        const threadData = this.runtime.threads.filter(thread => thread.target === instance.editingTarget);
        // Remove the target key, since it's a circular reference.
        const filteredThreadData = JSON.stringify(threadData, (key, value) => {
            if (key === 'target') return;
            return value;
        }, 2);
        this.emit('playgroundData', {
            blocks: this.editingTarget.blocks,
            threads: filteredThreadData
        });
    }

    /**
     * Post I/O data to the virtual devices.
     * @param {?string} device Name of virtual I/O device.
     * @param {object} data Any data object to post to the I/O device.
     */
    postIOData (device, data) {
        if (this.runtime.ioDevices[device]) {
            this.runtime.ioDevices[device].postData(data);
        }
    }

    /**
     * Load a project from a Scratch 2.0 JSON representation.
     * @param {?string} json JSON string representing the project.
     * @return {!Promise} Promise that resolves after targets are installed.
     */
    loadProject (json) {
        // @todo: Handle other formats, e.g., Scratch 1.4, Scratch 3.0.
        return sb2import(json, this.runtime).then(targets => {
            this.clear();
            for (let n = 0; n < targets.length; n++) {
                if (targets[n] !== null) {
                    this.runtime.targets.push(targets[n]);
                    targets[n].updateAllDrawableProperties();
                }
            }
        // Select the first target for editing, e.g., the first sprite.
            this.editingTarget = this.runtime.targets[1];

        // Update the VM user's knowledge of targets and blocks on the workspace.
            this.emitTargetsUpdate();
            this.emitWorkspaceUpdate();
            this.runtime.setEditingTarget(this.editingTarget);
        });
    }

    /**
     * Load a project from the Scratch web site, by ID.
     * @param {string} id - the ID of the project to download, as a string.
     */
    downloadProjectId (id) {
        const storage = this.runtime.storage;
        if (!storage) {
            log.error('No storage module present; cannot load project: ', id);
            return;
        }
        const vm = this;
        const promise = storage.load(storage.AssetType.Project, id);
        promise.then(projectAsset => {
            vm.loadProject(projectAsset.decodeText());
        });
    }

    /**
     * Add a single sprite from the "Sprite2" (i.e., SB2 sprite) format.
     * @param {string} json JSON string representing the sprite.
     */
    addSprite2 (json) {
    // Select new sprite.
        sb2import(json, this.runtime, true).then(targets => {
            this.runtime.targets.push(targets[0]);
            this.editingTarget = targets[0];
        // Update the VM user's knowledge of targets and blocks on the workspace.
            this.emitTargetsUpdate();
            this.emitWorkspaceUpdate();
            this.runtime.setEditingTarget(this.editingTarget);
        });
    }

    /**
     * Add a costume to the current editing target.
     * @param {string} md5ext - the MD5 and extension of the costume to be loaded.
     * @param {!object} costumeObject Object representing the costume.
     * @property {int} skinId - the ID of the costume's render skin, once installed.
     * @property {number} rotationCenterX - the X component of the costume's origin.
     * @property {number} rotationCenterY - the Y component of the costume's origin.
     * @property {number} [bitmapResolution] - the resolution scale for a bitmap costume.
     */
    addCostume (md5ext, costumeObject) {
        loadCostume(md5ext, costumeObject, this.runtime).then(() => {
            this.editingTarget.sprite.costumes.push(costumeObject);
            this.editingTarget.setCostume(
                this.editingTarget.sprite.costumes.length - 1
            );
        });
    }

    /**
     * Add a sound to the current editing target.
     * @param {!object} soundObject Object representing the costume.
     * @returns {?Promise} - a promise that resolves when the sound has been decoded and added
     */
    addSound (soundObject) {
        return loadSound(soundObject, this.runtime).then(() => {
            this.editingTarget.sprite.sounds.push(soundObject);
            this.emitTargetsUpdate();
        });
    }

    /**
     * Add a backdrop to the stage.
     * @param {string} md5ext - the MD5 and extension of the backdrop to be loaded.
     * @param {!object} backdropObject Object representing the backdrop.
     * @property {int} skinId - the ID of the backdrop's render skin, once installed.
     * @property {number} rotationCenterX - the X component of the backdrop's origin.
     * @property {number} rotationCenterY - the Y component of the backdrop's origin.
     * @property {number} [bitmapResolution] - the resolution scale for a bitmap backdrop.
     */
    addBackdrop (md5ext, backdropObject) {
        loadCostume(md5ext, backdropObject, this.runtime).then(() => {
            const stage = this.runtime.getTargetForStage();
            stage.sprite.costumes.push(backdropObject);
            stage.setCostume(stage.sprite.costumes.length - 1);
        });
    }

    /**
     * Rename a sprite.
     * @param {string} targetId ID of a target whose sprite to rename.
     * @param {string} newName New name of the sprite.
     */
    renameSprite (targetId, newName) {
        const target = this.runtime.getTargetById(targetId);
        if (target) {
            if (!target.isSprite()) {
                throw new Error('Cannot rename non-sprite targets.');
            }
            const sprite = target.sprite;
            if (!sprite) {
                throw new Error('No sprite associated with this target.');
            }
            if (newName && RESERVED_NAMES.indexOf(newName) === -1) {
                const names = this.runtime.targets
                    .filter(runtimeTarget => runtimeTarget.isSprite())
                    .map(runtimeTarget => runtimeTarget.sprite.name);

                sprite.name = StringUtil.unusedName(newName, names);
            }
            this.emitTargetsUpdate();
        } else {
            throw new Error('No target with the provided id.');
        }
    }

    /**
     * Delete a sprite and all its clones.
     * @param {string} targetId ID of a target whose sprite to delete.
     */
    deleteSprite (targetId) {
        const target = this.runtime.getTargetById(targetId);
        if (target) {
            if (!target.isSprite()) {
                throw new Error('Cannot delete non-sprite targets.');
            }
            const sprite = target.sprite;
            if (!sprite) {
                throw new Error('No sprite associated with this target.');
            }
            const currentEditingTarget = this.editingTarget;
            for (let i = 0; i < sprite.clones.length; i++) {
                const clone = sprite.clones[i];
                this.runtime.stopForTarget(sprite.clones[i]);
                this.runtime.disposeTarget(sprite.clones[i]);
                // Ensure editing target is switched if we are deleting it.
                if (clone === currentEditingTarget) {
                    this.setEditingTarget(this.runtime.targets[0].id);
                }
            }
            // Sprite object should be deleted by GC.
            this.emitTargetsUpdate();
        } else {
            throw new Error('No target with the provided id.');
        }
    }

    /**
     * Set the audio engine for the VM/runtime
     * @param {!AudioEngine} audioEngine The audio engine to attach
     */
    attachAudioEngine (audioEngine) {
        this.runtime.attachAudioEngine(audioEngine);
    }

    /**
     * Set the renderer for the VM/runtime
     * @param {!RenderWebGL} renderer The renderer to attach
     */
    attachRenderer (renderer) {
        this.runtime.attachRenderer(renderer);
    }

    /**
     * Set the storage module for the VM/runtime
     * @param {!ScratchStorage} storage The storage module to attach
     */
    attachStorage (storage) {
        this.runtime.attachStorage(storage);
    }

    /**
     * Handle a Blockly event for the current editing target.
     * @param {!Blockly.Event} e Any Blockly event.
     */
    blockListener (e) {
        if (this.editingTarget) {
            this.editingTarget.blocks.blocklyListen(e, this.runtime);
        }
    }

    /**
     * Handle a Blockly event for the flyout.
     * @param {!Blockly.Event} e Any Blockly event.
     */
    flyoutBlockListener (e) {
        this.runtime.flyoutBlocks.blocklyListen(e, this.runtime);
    }

    /**
     * Set an editing target. An editor UI can use this function to switch
     * between editing different targets, sprites, etc.
     * After switching the editing target, the VM may emit updates
     * to the list of targets and any attached workspace blocks
     * (see `emitTargetsUpdate` and `emitWorkspaceUpdate`).
     * @param {string} targetId Id of target to set as editing.
     */
    setEditingTarget (targetId) {
        // Has the target id changed? If not, exit.
        if (targetId === this.editingTarget.id) {
            return;
        }
        const target = this.runtime.getTargetById(targetId);
        if (target) {
            this.editingTarget = target;
            // Emit appropriate UI updates.
            this.emitTargetsUpdate();
            this.emitWorkspaceUpdate();
            this.runtime.setEditingTarget(target);
        }
    }

    /**
     * Emit metadata about available targets.
     * An editor UI could use this to display a list of targets and show
     * the currently editing one.
     */
    emitTargetsUpdate () {
        this.emit('targetsUpdate', {
            // [[target id, human readable target name], ...].
            targetList: this.runtime.targets
                .filter(
                    // Don't report clones.
                    target => !target.hasOwnProperty('isOriginal') || target.isOriginal
                ).map(
                    target => target.toJSON()
                ),
            // Currently editing target id.
            editingTarget: this.editingTarget ? this.editingTarget.id : null
        });
    }

    /**
     * Emit an Blockly/scratch-blocks compatible XML representation
     * of the current editing target's blocks.
     */
    emitWorkspaceUpdate () {
        this.emit('workspaceUpdate', {
            xml: this.editingTarget.blocks.toXML()
        });
    }

    /**
     * Get a target id for a drawable id. Useful for interacting with the renderer
     * @param {int} drawableId The drawable id to request the target id for
     * @returns {?string} The target id, if found. Will also be null if the target found is the stage.
     */
    getTargetIdForDrawableId (drawableId) {
        const target = this.runtime.getTargetByDrawableId(drawableId);
        if (target && target.hasOwnProperty('id') && target.hasOwnProperty('isStage') && !target.isStage) {
            return target.id;
        }
        return null;
    }

    /**
     * Put a target into a "drag" state, during which its X/Y positions will be unaffected
     * by blocks.
     * @param {string} targetId The id for the target to put into a drag state
     */
    startDrag (targetId) {
        const target = this.runtime.getTargetById(targetId);
        if (target) {
            target.startDrag();
            this.setEditingTarget(target.id);
        }
    }

    /**
     * Remove a target from a drag state, so blocks may begin affecting X/Y position again
     * @param {string} targetId The id for the target to remove from the drag state
     */
    stopDrag (targetId) {
        const target = this.runtime.getTargetById(targetId);
        if (target) target.stopDrag();
    }

    /**
     * Post/edit sprite info for the current editing target.
     * @param {object} data An object with sprite info data to set.
     */
    postSpriteInfo (data) {
        this.editingTarget.postSpriteInfo(data);
    }
}

module.exports = VirtualMachine;
