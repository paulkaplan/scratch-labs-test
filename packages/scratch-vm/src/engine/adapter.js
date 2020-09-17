var html = require('htmlparser2');
var memoize = require('memoizee');
var parseDOM = memoize(html.parseDOM, {
    length: 1,
    resolvers: [String],
    max: 200
});

/**
 * Adapter between block creation events and block representation which can be
 * used by the Scratch runtime.
 * @param {Object} e `Blockly.events.create`
 * @return {Array.<Object>} List of blocks from this CREATE event.
 */
module.exports = function (e) {
    // Validate input
    if (typeof e !== 'object') return;
    if (typeof e.xml !== 'object') return;

    return domToBlocks(parseDOM(e.xml.outerHTML));
};

/**
 * Convert outer blocks DOM from a Blockly CREATE event
 * to a usable form for the Scratch runtime.
 * This structure is based on Blockly xml.js:`domToWorkspace` and `domToBlock`.
 * @param {Element} blocksDOM DOM tree for this event.
 * @return {Array.<Object>} Usable list of blocks from this CREATE event.
 */
function domToBlocks (blocksDOM) {
    // At this level, there could be multiple blocks adjacent in the DOM tree.
    var blocks = {};
    for (var i = 0; i < blocksDOM.length; i++) {
        var block = blocksDOM[i];
        if (!block.name || !block.attribs) {
            continue;
        }
        var tagName = block.name.toLowerCase();
        if (tagName == 'block' || tagName == 'shadow') {
            domToBlock(block, blocks, true);
        }
    }
    // Flatten blocks object into a list.
    var blocksList = [];
    for (var b in blocks) {
        blocksList.push(blocks[b]);
    }
    return blocksList;
}

/**
 * Convert and an individual block DOM to the representation tree.
 * Based on Blockly's `domToBlockHeadless_`.
 * @param {Element} blockDOM DOM tree for an individual block.
 * @param {Object} blocks Collection of blocks to add to.
 * @param {Boolean} isTopBlock Whether blocks at this level are "top blocks."
 */
function domToBlock (blockDOM, blocks, isTopBlock) {
    // Block skeleton.
    var block = {
        id: blockDOM.attribs.id, // Block ID
        opcode: blockDOM.attribs.type, // For execution, "event_whengreenflag".
        inputs: {}, // Inputs to this block and the blocks they point to.
        fields: {}, // Fields on this block and their values.
        next: null, // Next block in the stack, if one exists.
        topLevel: isTopBlock // If this block starts a stack.
    };

    // Add the block to the representation tree.
    blocks[block.id] = block;

    // Process XML children and find enclosed blocks, fields, etc.
    for (var i = 0; i < blockDOM.children.length; i++) {
        var xmlChild = blockDOM.children[i];
        // Enclosed blocks and shadows
        var childBlockNode = null;
        var childShadowNode = null;
        for (var j = 0; j < xmlChild.children.length; j++) {
            var grandChildNode = xmlChild.children[j];
            if (!grandChildNode.name) {
                // Non-XML tag node.
                continue;
            }
            var grandChildNodeName = grandChildNode.name.toLowerCase();
            if (grandChildNodeName == 'block') {
                childBlockNode = grandChildNode;
            } else if (grandChildNodeName == 'shadow') {
                childShadowNode = grandChildNode;
            }
        }

        // Use shadow block only if there's no real block node.
        if (!childBlockNode && childShadowNode) {
            childBlockNode = childShadowNode;
        }

        // Not all Blockly-type blocks are handled here,
        // as we won't be using all of them for Scratch.
        switch (xmlChild.name.toLowerCase()) {
        case 'field':
            // Add the field to this block.
            var fieldName = xmlChild.attribs.name;
            var fieldData = '';
            if (xmlChild.children.length > 0 && xmlChild.children[0].data) {
                fieldData = xmlChild.children[0].data;
            } else {
                // If the child of the field with a data property
                // doesn't exist, set the data to an empty string.
                fieldData = '';
            }
            block.fields[fieldName] = {
                name: fieldName,
                value: fieldData
            };
            break;
        case 'value':
        case 'statement':
            // Recursively generate block structure for input block.
            domToBlock(childBlockNode, blocks, false);
            // Link this block's input to the child block.
            var inputName = xmlChild.attribs.name;
            block.inputs[inputName] = {
                name: inputName,
                block: childBlockNode.attribs.id
            };
            break;
        case 'next':
            if (!childBlockNode || !childBlockNode.attribs) {
                // Invalid child block.
                continue;
            }
            // Recursively generate block structure for next block.
            domToBlock(childBlockNode, blocks, false);
            // Link next block to this block.
            block.next = childBlockNode.attribs.id;
            break;
        }
    }
}
