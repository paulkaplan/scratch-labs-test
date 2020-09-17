/**
 * A thread is a running stack context and all the metadata needed.
 * @param {?string} firstBlock First block to execute in the thread.
 * @constructor
 */
function Thread (firstBlock) {
    /**
     * ID of top block of the thread
     * @type {!string}
     */
    this.topBlock = firstBlock;

    /**
     * Stack for the thread. When the sequencer enters a control structure,
     * the block is pushed onto the stack so we know where to exit.
     * @type {Array.<string>}
     */
    this.stack = [];

    /**
     * Stack frames for the thread. Store metadata for the executing blocks.
     * @type {Array.<Object>}
     */
    this.stackFrames = [];

    /**
     * Status of the thread, one of three states (below)
     * @type {number}
     */
    this.status = 0; /* Thread.STATUS_RUNNING */

    /**
     * Yield timer ID (for checking when the thread should unyield).
     * @type {number}
     */
    this.yieldTimerId = -1;
}

/**
 * Thread status for initialized or running thread.
 * Threads are in this state when the primitive is called for the first time.
 * @const
 */
Thread.STATUS_RUNNING = 0;

/**
 * Thread status for a yielded thread.
 * Threads are in this state when a primitive has yielded.
 * @const
 */
Thread.STATUS_YIELD = 1;

/**
 * Thread status for a finished/done thread.
 * Thread is moved to this state when the interpreter
 * can proceed with execution.
 * @const
 */
Thread.STATUS_DONE = 2;

/**
 * Push stack and update stack frames appropriately.
 * @param {string} blockId Block ID to push to stack.
 */
Thread.prototype.pushStack = function (blockId) {
    this.stack.push(blockId);
    // Push an empty stack frame, if we need one.
    // Might not, if we just popped the stack.
    if (this.stack.length > this.stackFrames.length) {
        this.stackFrames.push({});
    }
};

/**
 * Pop last block on the stack and its stack frame.
 * @return {string} Block ID popped from the stack.
 */
Thread.prototype.popStack = function () {
    this.stackFrames.pop();
    return this.stack.pop();
};

/**
 * Get top stack item.
 * @return {?string} Block ID on top of stack.
 */
Thread.prototype.peekStack = function () {
    return this.stack[this.stack.length - 1];
};


/**
 * Get top stack frame.
 * @return {?Object} Last stack frame stored on this thread.
 */
Thread.prototype.peekStackFrame = function () {
    return this.stackFrames[this.stackFrames.length - 1];
};

/**
 * Yields the thread.
 */
Thread.prototype.yield = function () {
    this.status = Thread.STATUS_YIELD;
};

module.exports = Thread;
