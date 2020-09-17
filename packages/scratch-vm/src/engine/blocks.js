var adapter = require('./adapter');

/**
 * @fileoverview
 * Store and mutate the VM block representation,
 * and handle updates from Scratch Blocks events.
 */

function Blocks () {
    /**
     * All blocks in the workspace.
     * Keys are block IDs, values are metadata about the block.
     * @type {Object.<string, Object>}
     */
    this._blocks = {};

    /**
     * All stacks in the workspace.
     * A list of block IDs that represent stacks (first block in stack).
     * @type {Array.<String>}
     */
    this._stacks = [];
}

/**
 * Blockly inputs that represent statements/branch.
 * are prefixed with this string.
 * @const{string}
 */
Blocks.BRANCH_INPUT_PREFIX = 'SUBSTACK';

/**
 * Provide an object with metadata for the requested block ID.
 * @param {!string} blockId ID of block we have stored.
 * @return {?Object} Metadata about the block, if it exists.
 */
Blocks.prototype.getBlock = function (blockId) {
    return this._blocks[blockId];
};

/**
 * Get all known top-level blocks that start stacks.
 * @return {Array.<string>} List of block IDs.
 */
Blocks.prototype.getStacks = function () {
    return this._stacks;
};

 /**
  * Get the next block for a particular block
  * @param {?string} id ID of block to get the next block for
  * @return {?string} ID of next block in the sequence
  */
Blocks.prototype.getNextBlock = function (id) {
    if (typeof this._blocks[id] === 'undefined') return null;
    return this._blocks[id].next;
};

/**
 * Get the branch for a particular C-shaped block.
 * @param {?string} id ID for block to get the branch for.
 * @param {?number} branchNum Which branch to select (e.g. for if-else).
 * @return {?string} ID of block in the branch.
 */
Blocks.prototype.getBranch = function (id, branchNum) {
    var block = this._blocks[id];
    if (typeof block === 'undefined') return null;
    if (!branchNum) branchNum = 1;

    var inputName = Blocks.BRANCH_INPUT_PREFIX;
    if (branchNum > 1) {
        inputName += branchNum;
    }

    // Empty C-block?
    if (!(inputName in block.inputs)) return null;
    return block.inputs[inputName].block;
};

/**
 * Get the opcode for a particular block
 * @param {?string} id ID of block to query
 * @return {?string} the opcode corresponding to that block
 */
Blocks.prototype.getOpcode = function (id) {
    if (typeof this._blocks[id] === 'undefined') return null;
    return this._blocks[id].opcode;
};

/**
 * Get all fields and their values for a block.
 * @param {?string} id ID of block to query.
 * @return {!Object} All fields and their values.
 */
Blocks.prototype.getFields = function (id) {
    if (typeof this._blocks[id] === 'undefined') return null;
    return this._blocks[id].fields;
};

/**
 * Get all non-branch inputs for a block.
 * @param {?string} id ID of block to query.
 * @return {!Object} All non-branch inputs and their associated blocks.
 */
Blocks.prototype.getInputs = function (id) {
    if (typeof this._blocks[id] === 'undefined') return null;
    var inputs = {};
    for (var input in this._blocks[id].inputs) {
        // Ignore blocks prefixed with branch prefix.
        if (input.substring(0, Blocks.BRANCH_INPUT_PREFIX.length)
            != Blocks.BRANCH_INPUT_PREFIX) {
            inputs[input] = this._blocks[id].inputs[input];
        }
    }
    return inputs;
};

// ---------------------------------------------------------------------

/**
 * Create event listener for blocks. Handles validation and serves as a generic
 * adapter between the blocks and the runtime interface.
 * @param {boolean} isFlyout If true, create a listener for flyout events.
 * @param {?Runtime} opt_runtime Optional runtime to forward click events to.
 * @return {Function} A generated listener to attach to Blockly instance.
 */

Blocks.prototype.generateBlockListener = function (isFlyout, opt_runtime) {
    var instance = this;
    /**
     * The actual generated block listener.
     * @param {Object} e Blockly "block" event
     */
    return function (e) {
        // Validate event
        if (typeof e !== 'object') return;
        if (typeof e.blockId !== 'string') return;

        // UI event: clicked stacks toggle in the runtime.
        if (e.element === 'stackclick') {
            if (opt_runtime) {
                opt_runtime.toggleStack(e.blockId);
            }
            return;
        }

        // Block create/update/destroy
        switch (e.type) {
        case 'create':
            var newBlocks = adapter(e);
            // A create event can create many blocks. Add them all.
            for (var i = 0; i < newBlocks.length; i++) {
                instance.createBlock(newBlocks[i], isFlyout);
            }
            break;
        case 'change':
            instance.changeBlock({
                id: e.blockId,
                element: e.element,
                name: e.name,
                value: e.newValue
            });
            break;
        case 'move':
            instance.moveBlock({
                id: e.blockId,
                oldParent: e.oldParentId,
                oldInput: e.oldInputName,
                newParent: e.newParentId,
                newInput: e.newInputName
            });
            break;
        case 'delete':
            instance.deleteBlock({
                id: e.blockId
            });
            break;
        }
    };
};

// ---------------------------------------------------------------------

/**
 * Block management: create blocks and stacks from a `create` event
 * @param {!Object} block Blockly create event to be processed
 * @param {boolean} opt_isFlyoutBlock Whether the block is in the flyout.
 */
Blocks.prototype.createBlock = function (block, opt_isFlyoutBlock) {
    // Create new block
    this._blocks[block.id] = block;

    // Push block id to stacks array.
    // Blocks are added as a top-level stack if they are marked as a top-block
    // (if they were top-level XML in the event) and if they are not
    // flyout blocks.
    if (!opt_isFlyoutBlock && block.topLevel) {
        this._addStack(block.id);
    }
};

/**
 * Block management: change block field values
 * @param {!Object} args Blockly change event to be processed
 */
Blocks.prototype.changeBlock = function (args) {
    // Validate
    if (args.element !== 'field') return;
    if (typeof this._blocks[args.id] === 'undefined') return;
    if (typeof this._blocks[args.id].fields[args.name] === 'undefined') return;

    // Update block value
    this._blocks[args.id].fields[args.name].value = args.value;
};

/**
 * Block management: move blocks from parent to parent
 * @param {!Object} e Blockly move event to be processed
 */
Blocks.prototype.moveBlock = function (e) {
    // Remove from any old parent.
    if (e.oldParent !== undefined) {
        var oldParent = this._blocks[e.oldParent];
        if (e.oldInput !== undefined &&
            oldParent.inputs[e.oldInput].block === e.id) {
            // This block was connected to the old parent's input.
            oldParent.inputs[e.oldInput].block = null;
        } else if (oldParent.next === e.id) {
            // This block was connected to the old parent's next connection.
            oldParent.next = null;
        }
    }

    // Has the block become a top-level block?
    if (e.newParent === undefined) {
        this._addStack(e.id);
    } else {
        // Remove stack, if one exists.
        this._deleteStack(e.id);
        // Otherwise, try to connect it in its new place.
        if (e.newInput !== undefined) {
             // Moved to the new parent's input.
            this._blocks[e.newParent].inputs[e.newInput] = {
                name: e.newInput,
                block: e.id
            };
        } else {
            // Moved to the new parent's next connection.
            this._blocks[e.newParent].next = e.id;
        }
    }
};

/**
 * Block management: delete blocks and their associated stacks
 * @param {!Object} e Blockly delete event to be processed
 */
Blocks.prototype.deleteBlock = function (e) {
    // @todo In runtime, stop threads running on this stack

    // Get block
    var block = this._blocks[e.id];

    // Delete children
    if (block.next !== null) {
        this.deleteBlock({id: block.next});
    }

    // Delete inputs (including branches)
    for (var input in block.inputs) {
        // If it's null, the block in this input moved away.
        if (block.inputs[input].block !== null) {
            this.deleteBlock({id: block.inputs[input].block});
        }
    }

    // Delete stack
    this._deleteStack(e.id);

    // Delete block
    delete this._blocks[e.id];
};

// ---------------------------------------------------------------------

/**
 * Helper to add a stack to `this._stacks`
 * @param {?string} id ID of block that starts the stack
 */
Blocks.prototype._addStack = function (id) {
    var i = this._stacks.indexOf(id);
    if (i > -1) return; // Already in stacks.
    this._stacks.push(id);
    // Update `topLevel` property on the top block.
    this._blocks[id].topLevel = true;
};

/**
 * Helper to remove a stack from `this._stacks`
 * @param {?string} id ID of block that starts the stack
 */
Blocks.prototype._deleteStack = function (id) {
    var i = this._stacks.indexOf(id);
    if (i > -1) this._stacks.splice(i, 1);
    // Update `topLevel` property on the top block.
    if (this._blocks[id]) this._blocks[id].topLevel = false;
};

module.exports = Blocks;
