var MathUtil = require('../util/math-util');
var Cast = require('../util/cast');

var Scratch3SoundBlocks = function (runtime) {
    /**
     * The runtime instantiating this block package.
     * @type {Runtime}
     */
    this.runtime = runtime;
};

/**
 * Retrieve the block primitives implemented by this package.
 * @return {object.<string, Function>} Mapping of opcode to Function.
 */
Scratch3SoundBlocks.prototype.getPrimitives = function () {
    return {
        sound_play: this.playSound,
        sound_playuntildone: this.playSoundAndWait,
        sound_stopallsounds: this.stopAllSounds,
        sound_playnoteforbeats: this.playNoteForBeats,
        sound_playdrumforbeats: this.playDrumForBeats,
        sound_restforbeats: this.restForBeats,
        sound_setinstrumentto: this.setInstrument,
        sound_seteffectto: this.setEffect,
        sound_changeeffectby: this.changeEffect,
        sound_cleareffects: this.clearEffects,
        sound_sounds_menu: this.soundsMenu,
        sound_beats_menu: this.beatsMenu,
        sound_effects_menu: this.effectsMenu,
        sound_setvolumeto: this.setVolume,
        sound_changevolumeby: this.changeVolume,
        sound_settempotobpm: this.setTempo,
        sound_changetempoby: this.changeTempo,
        sound_tempo: this.getTempo
    };
};

Scratch3SoundBlocks.prototype.playSound = function (args, util) {
    var index = this._getSoundIndex(args.SOUND_MENU, util);
    util.target.audioPlayer.playSound(index);
};

Scratch3SoundBlocks.prototype.playSoundAndWait = function (args, util) {
    var index = this._getSoundIndex(args.SOUND_MENU, util);
    return util.target.audioPlayer.playSound(index);
};

Scratch3SoundBlocks.prototype._getSoundIndex = function (soundName, util) {
    if (util.target.sprite.sounds.length === 0) {
        return 0;
    }
    var index;

    if (Number(soundName)) {
        soundName = Number(soundName);
        var len = util.target.sprite.sounds.length;
        index = MathUtil.wrapClamp(soundName, 1, len) - 1;
    } else {
        index = util.target.getSoundIndexByName(soundName);
        if (index === -1) {
            index = 0;
        }
    }
    return index;
};

Scratch3SoundBlocks.prototype.stopAllSounds = function (args, util) {
    util.target.audioPlayer.stopAllSounds();
};

Scratch3SoundBlocks.prototype.playNoteForBeats = function (args, util) {
    return util.target.audioPlayer.playNoteForBeats(args.NOTE, args.BEATS);
};

Scratch3SoundBlocks.prototype.playDrumForBeats = function (args, util) {
    return util.target.audioPlayer.playDrumForBeats(args.DRUM, args.BEATS);
};

Scratch3SoundBlocks.prototype.restForBeats = function (args, util) {
    return util.target.audioPlayer.waitForBeats(args.BEATS);
};

Scratch3SoundBlocks.prototype.setInstrument = function (args, util) {
    var instNum = Cast.toNumber(args.INSTRUMENT);
    return util.target.audioPlayer.setInstrument(instNum);
};

Scratch3SoundBlocks.prototype.setEffect = function (args, util) {
    var value = Cast.toNumber(args.VALUE);
    util.target.audioPlayer.setEffect(args.EFFECT, value);
};

Scratch3SoundBlocks.prototype.changeEffect = function (args, util) {
    var value = Cast.toNumber(args.VALUE);
    util.target.audioPlayer.changeEffect(args.EFFECT, value);
};

Scratch3SoundBlocks.prototype.clearEffects = function (args, util) {
    util.target.audioPlayer.clearEffects();
};

Scratch3SoundBlocks.prototype.setVolume = function (args, util) {
    var value = Cast.toNumber(args.VOLUME);
    util.target.audioPlayer.setVolume(value);
};

Scratch3SoundBlocks.prototype.changeVolume = function (args, util) {
    var value = Cast.toNumber(args.VOLUME);
    util.target.audioPlayer.changeVolume(value);
};

Scratch3SoundBlocks.prototype.getVolume = function (args, util) {
    return util.target.audioPlayer.currentVolume;
};

Scratch3SoundBlocks.prototype.setTempo = function (args, util) {
    var value = Cast.toNumber(args.TEMPO);
    util.target.audioPlayer.setTempo(value);
};

Scratch3SoundBlocks.prototype.changeTempo = function (args, util) {
    var value = Cast.toNumber(args.TEMPO);
    util.target.audioPlayer.changeTempo(value);
};

Scratch3SoundBlocks.prototype.getTempo = function (args, util) {
    return util.target.audioPlayer.currentTempo;
};

Scratch3SoundBlocks.prototype.soundsMenu = function (args) {
    return args.SOUND_MENU;
};

Scratch3SoundBlocks.prototype.beatsMenu = function (args) {
    return args.BEATS;
};

Scratch3SoundBlocks.prototype.effectsMenu = function (args) {
    return args.EFFECT;
};

module.exports = Scratch3SoundBlocks;
