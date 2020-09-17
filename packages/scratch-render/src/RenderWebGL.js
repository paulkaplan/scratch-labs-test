var EventEmitter = require('events');
var twgl = require('twgl.js');
var util = require('util');

var Drawable = require('./Drawable');
var ShaderManager = require('./ShaderManager');

/**
 * Create a renderer for drawing Scratch sprites to a canvas using WebGL.
 * Coordinates will default to Scratch 2.0 values if unspecified.
 * The stage's "native" size will be calculated from the these coordinates.
 * For example, the defaults result in a native size of 480x360.
 * Queries such as "touching color?" will always be executed at the native size.
 * @see setStageSize
 * @see resize
 * @param {canvas} canvas The canvas to draw onto.
 * @param {int} [xLeft=-240] The x-coordinate of the left edge.
 * @param {int} [xRight=240] The x-coordinate of the right edge.
 * @param {int} [yBottom=-180] The y-coordinate of the bottom edge.
 * @param {int} [yTop=180] The y-coordinate of the top edge.
 * @constructor
 */
function RenderWebGL(canvas, xLeft, xRight, yBottom, yTop) {

    // Bind event emitter and runtime to VM instance
    EventEmitter.call(this);

    // TODO: remove?
    twgl.setDefaults({crossOrigin: true});

    this._gl = twgl.getWebGLContext(canvas, {alpha: false, stencil: true});
    this._drawables = [];
    this._projection = twgl.m4.identity();

    this._createGeometry();

    this.setBackgroundColor(1, 1, 1);
    this.setStageSize(
        xLeft || -240, xRight || 240, yBottom || -180, yTop || 180);
    this.resize(this._nativeSize[0], this._nativeSize[1]);
    this._createQueryBuffers();

    var gl = this._gl;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); // TODO: track when a costume has partial transparency?
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    this._shaderManager = new ShaderManager(gl);
}

module.exports = RenderWebGL;

/**
 * Maximum touch size for a picking check.
 * TODO: Figure out a reasonable max size. Maybe this should be configurable?
 * @type {int[]}
 */
RenderWebGL.MAX_TOUCH_SIZE = [3, 3];

/**
 * Inherit from EventEmitter
 */
util.inherits(RenderWebGL, EventEmitter);

/**
 * Set the background color for the stage. The stage will be cleared with this
 * color each frame.
 * @param {number} red The red component for the background.
 * @param {number} green The green component for the background.
 * @param {number} blue The blue component for the background.
 */
RenderWebGL.prototype.setBackgroundColor = function(red, green, blue) {
    this._backgroundColor = [red, green, blue, 1];
};

/**
 * Set logical size of the stage in Scratch units.
 * @param {int} xLeft The left edge's x-coordinate. Scratch 2 uses -240.
 * @param {int} xRight The right edge's x-coordinate. Scratch 2 uses 240.
 * @param {int} yBottom The bottom edge's y-coordinate. Scratch 2 uses -180.
 * @param {int} yTop The top edge's y-coordinate. Scratch 2 uses 180.
 */
RenderWebGL.prototype.setStageSize = function (xLeft, xRight, yBottom, yTop) {
    this._xLeft = xLeft;
    this._xRight = xRight;
    this._yBottom = yBottom;
    this._yTop = yTop;
    this._nativeSize = [Math.abs(xRight - xLeft), Math.abs(yBottom - yTop)];
    this._projection = twgl.m4.ortho(xLeft, xRight, yBottom, yTop, -1, 1);
};

/**
 * Set the physical size of the stage in device-independent pixels.
 * This will be multiplied by the device's pixel ratio on high-DPI displays.
 * @param {int} pixelsWide The desired width in device-independent pixels.
 * @param {int} pixelsTall The desired height in device-independent pixels.
 */
RenderWebGL.prototype.resize = function (pixelsWide, pixelsTall) {
    var pixelRatio = window.devicePixelRatio || 1;
    this._gl.canvas.width = pixelsWide * pixelRatio;
    this._gl.canvas.height = pixelsTall * pixelRatio;
};

/**
 * Draw all current drawables and present the frame on the canvas.
 */
RenderWebGL.prototype.draw = function () {
    var gl = this._gl;

    twgl.bindFramebufferInfo(gl, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor.apply(gl, this._backgroundColor);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this._drawThese(
        this._drawables, ShaderManager.DRAW_MODE.default, this._projection);
};

/**
 * Draw all Drawables, with the possible exception of
 * @param {int[]} drawables The Drawable IDs to draw, possibly this._drawables.
 * @param {ShaderManager.DRAW_MODE} drawMode Draw normally, silhouette, etc.
 * @param {module:twgl/m4.Mat4} projection The projection matrix to use.
 * @param {Drawable~idFilterFunc} [filter] An optional filter function.
 * @param {Object.<string,*>} [extraUniforms] Extra uniforms for the shaders.
 * @private
 */
RenderWebGL.prototype._drawThese = function(
    drawables, drawMode, projection, filter, extraUniforms) {

    var gl = this._gl;
    var currentShader = null;

    var numDrawables = drawables.length;
    for (var drawableIndex = 0; drawableIndex < numDrawables; ++drawableIndex) {
        var drawableID = drawables[drawableIndex];

        // If we have a filter, check whether the ID fails
        if (filter && !filter(drawableID)) continue;

        var drawable = Drawable.getDrawableByID(drawableID);
        // TODO: check if drawable is inside the viewport before anything else

        var effectBits = drawable.getEnabledEffects();
        var newShader = this._shaderManager.getShader(drawMode, effectBits);
        if (currentShader != newShader) {
            currentShader = newShader;
            gl.useProgram(currentShader.program);
            twgl.setBuffersAndAttributes(gl, currentShader, this._bufferInfo);
            twgl.setUniforms(currentShader, {u_projectionMatrix: projection});
            twgl.setUniforms(currentShader, {u_fudge: window.fudge || 0});

            // TODO: should these be set after the Drawable's uniforms?
            // That would allow Drawable-scope uniforms to be overridden...
            if (extraUniforms) {
                twgl.setUniforms(currentShader, extraUniforms);
            }
        }

        twgl.setUniforms(currentShader, drawable.getUniforms());

        twgl.drawBufferInfo(gl, gl.TRIANGLES, this._bufferInfo);
    }
};

/**
 * Create a new Drawable and add it to the scene.
 * @returns {int} The ID of the new Drawable.
 */
RenderWebGL.prototype.createDrawable = function () {
    var drawable = new Drawable(this._gl);
    var drawableID = drawable.getID();
    this._drawables.push(drawableID);
    return drawableID;
};

/**
 * Destroy a Drawable, removing it from the scene.
 * @param {int} drawableID The ID of the Drawable to remove.
 * @returns {boolean} True iff the drawable was found and removed.
 */
RenderWebGL.prototype.destroyDrawable = function (drawableID) {
    var index = this._drawables.indexOf(drawableID);
    if (index >= 0) {
        Drawable.getDrawableByID(drawableID).dispose();
        this._drawables.splice(index, 1);
        return true;
    }
    return false;
};

/**
 * Update the position, direction, scale, or effect properties of this Drawable.
 * @param {int} drawableID The ID of the Drawable to update.
 * @param {Object.<string,*>} properties The new property values to set.
 */
RenderWebGL.prototype.updateDrawableProperties = function (
    drawableID, properties) {

    var drawable = Drawable.getDrawableByID(drawableID);
    if (drawable) {
        drawable.updateProperties(properties);
    }
};

/**
 * Retrieve the renderer's projection matrix.
 * @returns {module:twgl/m4.Mat4} The projection matrix.
 */
RenderWebGL.prototype.getProjectionMatrix = function () {
    return this._projection;
};

/**
 * Build geometry (vertex and index) buffers.
 * @private
 */
RenderWebGL.prototype._createGeometry = function () {
    var quad = {
        a_position: {
            numComponents: 2,
            data: [
                -0.5, -0.5,
                0.5, -0.5,
                -0.5, 0.5,
                -0.5, 0.5,
                0.5, -0.5,
                0.5, 0.5
            ]
        },
        a_texCoord: {
            numComponents: 2,
            data: [
                1, 0,
                0, 0,
                1, 1,
                1, 1,
                0, 0,
                0, 1
            ]
        }
    };
    this._bufferInfo = twgl.createBufferInfoFromArrays(this._gl, quad);
};

/**
 * Create the frame buffers used for queries such as picking and color-touching.
 * These buffers are fixed in size regardless of the size of the main render
 * target. The fixed size allows (more) consistent behavior across devices and
 * presentation modes.
 * @private
 */
RenderWebGL.prototype._createQueryBuffers = function () {
    var gl = this._gl;
    var attachments = [
        {format: gl.RGBA },
        {format: gl.DEPTH_STENCIL }
    ];

    this._pickBufferInfo = twgl.createFramebufferInfo(
        gl, attachments,
        RenderWebGL.MAX_TOUCH_SIZE[0], RenderWebGL.MAX_TOUCH_SIZE[1]);

    // TODO: should we create this on demand to save memory?
    // A 480x360 32-bpp buffer is 675 KiB.
    this._queryBufferInfo = twgl.createFramebufferInfo(
        gl, attachments, this._nativeSize[0], this._nativeSize[1]);
};

/**
 * Tell the renderer to draw various debug information to the provided canvas
 * during certain operations.
 * @param {canvas} canvas The canvas to use for debug output.
 */
RenderWebGL.prototype.setDebugCanvas = function (canvas) {
    this._debugCanvas = canvas;
};

/**
 * Detect which sprite, if any, is at the given location.
 * @param {int} centerX The client x coordinate of the picking location.
 * @param {int} centerY The client y coordinate of the picking location.
 * @param {int} touchWidth The client width of the touch event (optional).
 * @param {int} touchHeight The client height of the touch event (optional).
 * @param {int[]} candidateIDs The Drawable IDs to pick from, otherwise all.
 * @returns {int} The ID of the topmost Drawable under the picking location, or
 * Drawable.NONE if there is no Drawable at that location.
 */
RenderWebGL.prototype.pick = function (
    centerX, centerY, touchWidth, touchHeight, candidateIDs) {
    var gl = this._gl;

    touchWidth = touchWidth || 1;
    touchHeight = touchHeight || 1;
    candidateIDs = candidateIDs || this._drawables;

    var clientToGLX = gl.canvas.width / gl.canvas.clientWidth;
    var clientToGLY = gl.canvas.height / gl.canvas.clientHeight;

    centerX *= clientToGLX;
    centerY *= clientToGLY;
    touchWidth *= clientToGLX;
    touchHeight *= clientToGLY;

    touchWidth =
        Math.max(1, Math.min(touchWidth, RenderWebGL.MAX_TOUCH_SIZE[0]));
    touchHeight =
        Math.max(1, Math.min(touchHeight, RenderWebGL.MAX_TOUCH_SIZE[1]));

    var pixelLeft = Math.floor(centerX - Math.floor(touchWidth / 2) + 0.5);
    var pixelRight = Math.floor(centerX + Math.ceil(touchWidth / 2) + 0.5);
    var pixelTop = Math.floor(centerY - Math.floor(touchHeight / 2) + 0.5);
    var pixelBottom = Math.floor(centerY + Math.ceil(touchHeight / 2) + 0.5);

    twgl.bindFramebufferInfo(gl, this._pickBufferInfo);
    gl.viewport(0, 0, touchWidth, touchHeight);

    var noneColor = Drawable.color4fFromID(Drawable.NONE);
    gl.clearColor.apply(gl, noneColor);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var widthPerPixel = (this._xRight - this._xLeft) / this._gl.canvas.width;
    var heightPerPixel = (this._yBottom - this._yTop) / this._gl.canvas.height;

    var pickLeft = this._xLeft + pixelLeft * widthPerPixel;
    var pickRight = this._xLeft + pixelRight * widthPerPixel;
    var pickTop = this._yTop + pixelTop * heightPerPixel;
    var pickBottom = this._yTop + pixelBottom * heightPerPixel;

    var projection = twgl.m4.ortho(
        pickLeft, pickRight, pickTop, pickBottom, -1, 1);

    this._drawThese(
        candidateIDs, ShaderManager.DRAW_MODE.silhouette, projection);

    var pixels = new Buffer(touchWidth * touchHeight * 4);
    gl.readPixels(
        0, 0, touchWidth, touchHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    if (this._debugCanvas) {
        this._debugCanvas.width = touchWidth;
        this._debugCanvas.height = touchHeight;
        var context = this._debugCanvas.getContext('2d');
        var imageData = context.getImageData(0, 0, touchWidth, touchHeight);
        for (var i = 0, bytes = pixels.length; i < bytes; ++i) {
            imageData.data[i] = pixels[i];
        }
        context.putImageData(imageData, 0, 0);
    }

    var hits = {};
    for (var pixelBase = 0; pixelBase < pixels.length; pixelBase += 4) {
        var pixelID = Drawable.color4ubToID(
            pixels[pixelBase],
            pixels[pixelBase + 1],
            pixels[pixelBase + 2],
            pixels[pixelBase + 3]);
        hits[pixelID] = (hits[pixelID] || 0) + 1;
    }

    // Bias toward selecting anything over nothing
    hits[Drawable.NONE] = 0;

    var hit = Drawable.NONE;
    for (var hitID in hits) {
        if (hits.hasOwnProperty(hitID) && (hits[hitID] > hits[hit])) {
            hit = hitID;
        }
    }

    return hit | 0;
};

/**
 * Check if a particular Drawable is touching a particular color.
 * @param {int} drawableID The ID of the Drawable to check.
 * @param {int[]} color3ub Test if the Drawable is touching this color.
 * @param {float[]} [mask3f] Optionally mask the check to this part of Drawable.
 * @returns {boolean} True iff the Drawable is touching the color.
 */
RenderWebGL.prototype.isTouchingColor = function(drawableID, color3ub, mask3f) {

    var gl = this._gl;

    twgl.bindFramebufferInfo(gl, this._queryBufferInfo);

    // TODO: restrict to only the area overlapped by the target Drawable
    // - limit size of viewport to the AABB around the target Drawable
    // - draw only the Drawables which could overlap the target Drawable
    // - read only the pixels in the AABB around the target Drawable
    gl.viewport(0, 0, this._nativeSize[0], this._nativeSize[1]);

    gl.clearColor.apply(gl, this._backgroundColor);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    var extraUniforms;
    if (mask3f) {
        extraUniforms = {
            u_colorMask: mask3f,
            u_colorMaskTolerance: 1 / 255
        };
    }

    try {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, 1, 1);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
        gl.colorMask(false, false, false, false);
        this._drawThese(
            [drawableID],
            mask3f ?
                ShaderManager.DRAW_MODE.colorMask :
                ShaderManager.DRAW_MODE.silhouette,
            this._projection,
            undefined,
            extraUniforms);

        gl.stencilFunc(gl.EQUAL, 1, 1);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
        gl.colorMask(true, true, true, true);

        // TODO: only draw items which could possibly overlap target Drawable
        // It might work to use the filter function for that
        this._drawThese(
            this._drawables, ShaderManager.DRAW_MODE.default, this._projection,
            function (testID) {
                return testID != drawableID;
            });
    }
    finally {
        gl.colorMask(true, true, true, true);
        gl.disable(gl.STENCIL_TEST);
    }

    var pixels = new Buffer(this._nativeSize[0] * this._nativeSize[1] * 4);
    gl.readPixels(
        0, 0, this._nativeSize[0], this._nativeSize[1],
        gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    if (this._debugCanvas) {
        this._debugCanvas.width = this._nativeSize[0];
        this._debugCanvas.height = this._nativeSize[1];
        var context = this._debugCanvas.getContext('2d');
        var imageData = context.getImageData(
            0, 0, this._nativeSize[0], this._nativeSize[1]);
        for (var i = 0, bytes = pixels.length; i < bytes; ++i) {
            imageData.data[i] = pixels[i];
        }
        context.putImageData(imageData, 0, 0);
    }

    for (var pixelBase = 0; pixelBase < pixels.length; pixelBase += 4) {
        // TODO: tolerance?
        // TODO: use u_colorMask to make this test something like "pixel != 0"
        if ((pixels[pixelBase] == color3ub[0]) &&
            (pixels[pixelBase + 1] == color3ub[1]) &&
            (pixels[pixelBase + 2] == color3ub[2])) {
            return true;
        }
    }

    return false;
};
