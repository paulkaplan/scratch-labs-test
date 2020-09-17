/**
 * @fileoverview
 * Partial implementation of an SB2 JSON importer.
 * Parses provided JSON and then generates all needed
 * scratch-vm runtime structures.
 */

var ScratchStorage = require('scratch-storage');
var AssetType = ScratchStorage.AssetType;

var Blocks = require('../engine/blocks');
var RenderedTarget = require('../sprites/rendered-target');
var Sprite = require('../sprites/sprite');
var Color = require('../util/color');
var log = require('../util/log');
var uid = require('../util/uid');
var specMap = require('./sb2specmap');
var Variable = require('../engine/variable');
var List = require('../engine/list');

/**
 * Parse a single "Scratch object" and create all its in-memory VM objects.
 * @param {!object} object From-JSON "Scratch object:" sprite, stage, watcher.
 * @param {!Runtime} runtime Runtime object to load all structures into.
 * @param {boolean} topLevel Whether this is the top-level object (stage).
 * @return {?Target} Target created (stage or sprite).
 */
var parseScratchObject = function (object, runtime, topLevel) {
    if (!object.hasOwnProperty('objName')) {
        // Watcher/monitor - skip this object until those are implemented in VM.
        // @todo
        return null;
    }
    // Blocks container for this object.
    var blocks = new Blocks();
    // @todo: For now, load all Scratch objects (stage/sprites) as a Sprite.
    var sprite = new Sprite(blocks, runtime);
    // Sprite/stage name from JSON.
    if (object.hasOwnProperty('objName')) {
        sprite.name = object.objName;
    }
    // Costumes from JSON.
    var costumePromises = [];
    if (object.hasOwnProperty('costumes')) {
        for (var i = 0; i < object.costumes.length; i++) {
            var costumeSource = object.costumes[i];
            var costume = {
                name: costumeSource.costumeName,
                bitmapResolution: costumeSource.bitmapResolution || 1,
                rotationCenterX: costumeSource.rotationCenterX,
                rotationCenterY: costumeSource.rotationCenterY,
                skinId: null
            };
            var costumePromise = loadCostume(costumeSource.baseLayerMD5, costume, runtime);
            if (costumePromise) {
                costumePromises.push(costumePromise);
            }
            sprite.costumes.push(costume);
        }
    }
    // Sounds from JSON
    if (object.hasOwnProperty('sounds')) {
        for (var s = 0; s < object.sounds.length; s++) {
            var soundSource = object.sounds[s];
            var sound = {
                name: soundSource.soundName,
                format: soundSource.format,
                rate: soundSource.rate,
                sampleCount: soundSource.sampleCount,
                soundID: soundSource.soundID,
                md5: soundSource.md5,
                data: null
            };
            loadSound(sound, runtime);
            sprite.sounds.push(sound);
        }
    }
    // If included, parse any and all scripts/blocks on the object.
    if (object.hasOwnProperty('scripts')) {
        parseScripts(object.scripts, blocks);
    }
    // Create the first clone, and load its run-state from JSON.
    var target = sprite.createClone();
    // Add it to the runtime's list of targets.
    runtime.targets.push(target);
    // Load target properties from JSON.
    if (object.hasOwnProperty('variables')) {
        for (var j = 0; j < object.variables.length; j++) {
            var variable = object.variables[j];
            target.variables[variable.name] = new Variable(
                variable.name,
                variable.value,
                variable.isPersistent
            );
        }
    }
    if (object.hasOwnProperty('lists')) {
        for (var k = 0; k < object.lists.length; k++) {
            var list = object.lists[k];
            // @todo: monitor properties.
            target.lists[list.listName] = new List(
                list.listName,
                list.contents
            );
        }
    }
    if (object.hasOwnProperty('scratchX')) {
        target.x = object.scratchX;
    }
    if (object.hasOwnProperty('scratchY')) {
        target.y = object.scratchY;
    }
    if (object.hasOwnProperty('direction')) {
        target.direction = object.direction;
    }
    if (object.hasOwnProperty('isDraggable')) {
        target.draggable = object.isDraggable;
    }
    if (object.hasOwnProperty('scale')) {
        // SB2 stores as 1.0 = 100%; we use % in the VM.
        target.size = object.scale * 100;
    }
    if (object.hasOwnProperty('visible')) {
        target.visible = object.visible;
    }
    if (object.hasOwnProperty('currentCostumeIndex')) {
        target.currentCostume = Math.round(object.currentCostumeIndex);
    }
    if (object.hasOwnProperty('rotationStyle')) {
        if (object.rotationStyle === 'none') {
            target.rotationStyle = RenderedTarget.ROTATION_STYLE_NONE;
        } else if (object.rotationStyle === 'leftRight') {
            target.rotationStyle = RenderedTarget.ROTATION_STYLE_LEFT_RIGHT;
        } else if (object.rotationStyle === 'normal') {
            target.rotationStyle = RenderedTarget.ROTATION_STYLE_ALL_AROUND;
        }
    }
    target.isStage = topLevel;
    Promise.all(costumePromises).then(function () {
        target.updateAllDrawableProperties();
    });
    // The stage will have child objects; recursively process them.
    if (object.children) {
        for (var m = 0; m < object.children.length; m++) {
            parseScratchObject(object.children[m], runtime, false);
        }
    }
    return target;
};

/**
 * Load a costume's asset into memory asynchronously.
 * Do not call this unless there is a renderer attached.
 * @param {string} md5ext - the MD5 and extension of the costume to be loaded.
 * @param {!object} costume - the Scratch costume object.
 * @property {int} skinId - the ID of the costume's render skin, once installed.
 * @property {number} rotationCenterX - the X component of the costume's origin.
 * @property {number} rotationCenterY - the Y component of the costume's origin.
 * @property {number} [bitmapResolution] - the resolution scale for a bitmap costume.
 * @param {!Runtime} runtime - Scratch runtime, used to access the storage module.
 * @returns {?Promise} - a promise which will resolve after skinId is set, or null on error.
 */
var loadCostume = function (md5ext, costume, runtime) {
    if (!runtime.storage) {
        log.error('No storage module present; cannot load costume asset: ', md5ext);
        return null;
    }
    if (!runtime.renderer) {
        log.error('No rendering module present; cannot load costume asset: ', md5ext);
        return null;
    }

    var idParts = md5ext.split('.');
    var md5 = idParts[0];
    var ext = idParts[1].toUpperCase();
    var assetType = (ext === 'SVG') ? AssetType.ImageVector : AssetType.ImageBitmap;

    var rotationCenter = [
        costume.rotationCenterX / costume.bitmapResolution,
        costume.rotationCenterY / costume.bitmapResolution
    ];

    var promise = runtime.storage.load(assetType, md5);

    if (assetType === AssetType.ImageVector) {
        promise = promise.then(function (costumeAsset) {
            costume.skinId = runtime.renderer.createSVGSkin(costumeAsset.decodeText(), rotationCenter);
        });
    } else {
        promise = promise.then(function (costumeAsset) {
            return new Promise(function (resolve, reject) {
                var imageElement = new Image();
                var removeEventListeners; // fix no-use-before-define
                var onError = function () {
                    removeEventListeners();
                    reject();
                };
                var onLoad = function () {
                    removeEventListeners();
                    resolve(imageElement);
                };
                removeEventListeners = function () {
                    imageElement.removeEventListener('error', onError);
                    imageElement.removeEventListener('load', onLoad);
                };
                imageElement.addEventListener('error', onError);
                imageElement.addEventListener('load', onLoad);
                imageElement.src = costumeAsset.encodeDataURI();
            });
        }).then(function (imageElement) {
            costume.skinId = runtime.renderer.createBitmapSkin(imageElement, costume.bitmapResolution, rotationCenter);
        });
    }
    return promise;
};

/**
 * Load a sound's asset into memory asynchronously.
 * @param {!object} sound - the Scratch sound object.
 * @property {string} md5 - the MD5 and extension of the sound to be loaded.
 * @property {Buffer} data - sound data will be written here once loaded.
 * @param {!Runtime} runtime - Scratch runtime, used to access the storage module.
 */
var loadSound = function (sound, runtime) {
    if (!runtime.storage) {
        log.error('No storage module present; cannot load sound asset: ', sound.md5);
        return;
    }
    var idParts = sound.md5.split('.');
    var md5 = idParts[0];
    runtime.storage.load(AssetType.Sound, md5).then(function (soundAsset) {
        sound.data = soundAsset.data;
        // @todo register sound.data with scratch-audio
    });
};

/**
 * Top-level handler. Parse provided JSON,
 * and process the top-level object (the stage object).
 * @param {!string} json SB2-format JSON to load.
 * @param {!Runtime} runtime Runtime object to load all structures into.
 * @param {boolean=} optForceSprite If set, treat as sprite (Sprite2).
 * @return {?Target} Top-level target created (stage or sprite).
 */
var sb2import = function (json, runtime, optForceSprite) {
    return parseScratchObject(
        JSON.parse(json),
        runtime,
        !optForceSprite
    );
};

/**
 * Parse a Scratch object's scripts into VM blocks.
 * This should only handle top-level scripts that include X, Y coordinates.
 * @param {!object} scripts Scripts object from SB2 JSON.
 * @param {!Blocks} blocks Blocks object to load parsed blocks into.
 */
var parseScripts = function (scripts, blocks) {
    for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        var scriptX = script[0];
        var scriptY = script[1];
        var blockList = script[2];
        var parsedBlockList = parseBlockList(blockList);
        if (parsedBlockList[0]) {
            // Adjust script coordinates to account for
            // larger block size in scratch-blocks.
            // @todo: Determine more precisely the right formulas here.
            parsedBlockList[0].x = scriptX * 1.5;
            parsedBlockList[0].y = scriptY * 2.2;
            parsedBlockList[0].topLevel = true;
            parsedBlockList[0].parent = null;
        }
        // Flatten children and create add the blocks.
        var convertedBlocks = flatten(parsedBlockList);
        for (var j = 0; j < convertedBlocks.length; j++) {
            blocks.createBlock(convertedBlocks[j]);
        }
    }
};

/**
 * Parse any list of blocks from SB2 JSON into a list of VM-format blocks.
 * Could be used to parse a top-level script,
 * a list of blocks in a branch (e.g., in forever),
 * or a list of blocks in an argument (e.g., move [pick random...]).
 * @param {Array.<object>} blockList SB2 JSON-format block list.
 * @return {Array.<object>} Scratch VM-format block list.
 */
var parseBlockList = function (blockList) {
    var resultingList = [];
    var previousBlock = null; // For setting next.
    for (var i = 0; i < blockList.length; i++) {
        var block = blockList[i];
        var parsedBlock = parseBlock(block);
        if (typeof parsedBlock === 'undefined') continue;
        if (previousBlock) {
            parsedBlock.parent = previousBlock.id;
            previousBlock.next = parsedBlock.id;
        }
        previousBlock = parsedBlock;
        resultingList.push(parsedBlock);
    }
    return resultingList;
};

/**
 * Flatten a block tree into a block list.
 * Children are temporarily stored on the `block.children` property.
 * @param {Array.<object>} blocks list generated by `parseBlockList`.
 * @return {Array.<object>} Flattened list to be passed to `blocks.createBlock`.
 */
var flatten = function (blocks) {
    var finalBlocks = [];
    for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];
        finalBlocks.push(block);
        if (block.children) {
            finalBlocks = finalBlocks.concat(flatten(block.children));
        }
        delete block.children;
    }
    return finalBlocks;
};

/**
 * Convert a Scratch 2.0 procedure string (e.g., "my_procedure %s %b %n")
 * into an argument map. This allows us to provide the expected inputs
 * to a mutated procedure call.
 * @param {string} procCode Scratch 2.0 procedure string.
 * @return {object} Argument map compatible with those in sb2specmap.
 */
var parseProcedureArgMap = function (procCode) {
    var argMap = [
        {} // First item in list is op string.
    ];
    var INPUT_PREFIX = 'input';
    var inputCount = 0;
    // Split by %n, %b, %s.
    var parts = procCode.split(/(?=[^\\]%[nbs])/);
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i].trim();
        if (part.substring(0, 1) === '%') {
            var argType = part.substring(1, 2);
            var arg = {
                type: 'input',
                inputName: INPUT_PREFIX + (inputCount++)
            };
            if (argType === 'n') {
                arg.inputOp = 'math_number';
            } else if (argType === 's') {
                arg.inputOp = 'text';
            }
            argMap.push(arg);
        }
    }
    return argMap;
};

/**
 * Parse a single SB2 JSON-formatted block and its children.
 * @param {!object} sb2block SB2 JSON-formatted block.
 * @return {object} Scratch VM format block.
 */
var parseBlock = function (sb2block) {
    // First item in block object is the old opcode (e.g., 'forward:').
    var oldOpcode = sb2block[0];
    // Convert the block using the specMap. See sb2specmap.js.
    if (!oldOpcode || !specMap[oldOpcode]) {
        log.warn('Couldn\'t find SB2 block: ', oldOpcode);
        return;
    }
    var blockMetadata = specMap[oldOpcode];
    // Block skeleton.
    var activeBlock = {
        id: uid(), // Generate a new block unique ID.
        opcode: blockMetadata.opcode, // Converted, e.g. "motion_movesteps".
        inputs: {}, // Inputs to this block and the blocks they point to.
        fields: {}, // Fields on this block and their values.
        next: null, // Next block.
        shadow: false, // No shadow blocks in an SB2 by default.
        children: [] // Store any generated children, flattened in `flatten`.
    };
    // For a procedure call, generate argument map from proc string.
    if (oldOpcode === 'call') {
        blockMetadata.argMap = parseProcedureArgMap(sb2block[1]);
    }
    // Look at the expected arguments in `blockMetadata.argMap.`
    // The basic problem here is to turn positional SB2 arguments into
    // non-positional named Scratch VM arguments.
    for (var i = 0; i < blockMetadata.argMap.length; i++) {
        var expectedArg = blockMetadata.argMap[i];
        var providedArg = sb2block[i + 1]; // (i = 0 is opcode)
        // Whether the input is obscuring a shadow.
        var shadowObscured = false;
        // Positional argument is an input.
        if (expectedArg.type === 'input') {
            // Create a new block and input metadata.
            var inputUid = uid();
            activeBlock.inputs[expectedArg.inputName] = {
                name: expectedArg.inputName,
                block: null,
                shadow: null
            };
            if (typeof providedArg === 'object' && providedArg) {
                // Block or block list occupies the input.
                var innerBlocks;
                if (typeof providedArg[0] === 'object' && providedArg[0]) {
                    // Block list occupies the input.
                    innerBlocks = parseBlockList(providedArg);
                } else {
                    // Single block occupies the input.
                    innerBlocks = [parseBlock(providedArg)];
                }
                var previousBlock = null;
                for (var j = 0; j < innerBlocks.length; j++) {
                    if (j === 0) {
                        innerBlocks[j].parent = activeBlock.id;
                    } else {
                        innerBlocks[j].parent = previousBlock;
                    }
                    previousBlock = innerBlocks[j].id;
                }
                // Obscures any shadow.
                shadowObscured = true;
                activeBlock.inputs[expectedArg.inputName].block = (
                    innerBlocks[0].id
                );
                activeBlock.children = (
                    activeBlock.children.concat(innerBlocks)
                );
            }
            // Generate a shadow block to occupy the input.
            if (!expectedArg.inputOp) {
                // No editable shadow input; e.g., for a boolean.
                continue;
            }
            // Each shadow has a field generated for it automatically.
            // Value to be filled in the field.
            var fieldValue = providedArg;
            // Shadows' field names match the input name, except for these:
            var fieldName = expectedArg.inputName;
            if (expectedArg.inputOp === 'math_number' ||
                expectedArg.inputOp === 'math_whole_number' ||
                expectedArg.inputOp === 'math_positive_number' ||
                expectedArg.inputOp === 'math_integer' ||
                expectedArg.inputOp === 'math_angle') {
                fieldName = 'NUM';
                // Fields are given Scratch 2.0 default values if obscured.
                if (shadowObscured) {
                    fieldValue = 10;
                }
            } else if (expectedArg.inputOp === 'text') {
                fieldName = 'TEXT';
                if (shadowObscured) {
                    fieldValue = '';
                }
            } else if (expectedArg.inputOp === 'colour_picker') {
                // Convert SB2 color to hex.
                fieldValue = Color.decimalToHex(providedArg);
                fieldName = 'COLOUR';
                if (shadowObscured) {
                    fieldValue = '#990000';
                }
            } else if (shadowObscured) {
                // Filled drop-down menu.
                fieldValue = '';
            }
            var fields = {};
            fields[fieldName] = {
                name: fieldName,
                value: fieldValue
            };
            activeBlock.children.push({
                id: inputUid,
                opcode: expectedArg.inputOp,
                inputs: {},
                fields: fields,
                next: null,
                topLevel: false,
                parent: activeBlock.id,
                shadow: true
            });
            activeBlock.inputs[expectedArg.inputName].shadow = inputUid;
            // If no block occupying the input, alias to the shadow.
            if (!activeBlock.inputs[expectedArg.inputName].block) {
                activeBlock.inputs[expectedArg.inputName].block = inputUid;
            }
        } else if (expectedArg.type === 'field') {
            // Add as a field on this block.
            activeBlock.fields[expectedArg.fieldName] = {
                name: expectedArg.fieldName,
                value: providedArg
            };
        }
    }
    // Special cases to generate mutations.
    if (oldOpcode === 'stopScripts') {
        // Mutation for stop block: if the argument is 'other scripts',
        // the block needs a next connection.
        if (sb2block[1] === 'other scripts in sprite' ||
            sb2block[1] === 'other scripts in stage') {
            activeBlock.mutation = {
                tagName: 'mutation',
                hasnext: 'true',
                children: []
            };
        }
    } else if (oldOpcode === 'procDef') {
        // Mutation for procedure definition:
        // store all 2.0 proc data.
        var procData = sb2block.slice(1);
        activeBlock.mutation = {
            tagName: 'mutation',
            proccode: procData[0], // e.g., "abc %n %b %s"
            argumentnames: JSON.stringify(procData[1]), // e.g. ['arg1', 'arg2']
            argumentdefaults: JSON.stringify(procData[2]), // e.g., [1, 'abc']
            warp: procData[3], // Warp mode, e.g., true/false.
            children: []
        };
    } else if (oldOpcode === 'call') {
        // Mutation for procedure call:
        // string for proc code (e.g., "abc %n %b %s").
        activeBlock.mutation = {
            tagName: 'mutation',
            children: [],
            proccode: sb2block[1]
        };
    } else if (oldOpcode === 'getParam') {
        // Mutation for procedure parameter.
        activeBlock.mutation = {
            tagName: 'mutation',
            children: [],
            paramname: sb2block[1], // Name of parameter.
            shape: sb2block[2] // Shape - in 2.0, 'r' or 'b'.
        };
    }
    return activeBlock;
};

module.exports = sb2import;
