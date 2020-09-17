var MathUtil = require('../util/math-util');
var Cast = require('../util/cast');
var Clone = require('../util/clone');

var Scratch3SoundBlocks = function (runtime) {
    /**
     * The runtime instantiating this block package.
     * @type {Runtime}
     */
    this.runtime = runtime;
};

/**
 * The key to load & store a target's sound-related state.
 * @type {string}
 */
Scratch3SoundBlocks.STATE_KEY = 'Scratch.sound';

/**
 * The default sound-related state, to be used when a target has no existing sound state.
 * @type {SoundState}
 */
Scratch3SoundBlocks.DEFAULT_SOUND_STATE = {
    volume: 100,
    currentInstrument: 0,
    effects: {
        pitch: 0,
        pan: 0,
        echo: 0,
        reverb: 0,
        fuzz: 0,
        robot: 0
    }
};

/**
 * The minimum and maximum MIDI note numbers, for clamping the input to play note.
 * @type {{min: number, max: number}}
 */
Scratch3SoundBlocks.MIDI_NOTE_RANGE = {min: 36, max: 96}; // C2 to C7

/**
 * The minimum and maximum beat values, for clamping the duration of play note, play drum and rest.
 * 100 beats at the default tempo of 60bpm is 100 seconds.
 * @type {{min: number, max: number}}
 */
Scratch3SoundBlocks.BEAT_RANGE = {min: 0, max: 100};

 /** The minimum and maximum tempo values, in bpm.
 * @type {{min: number, max: number}}
 */
Scratch3SoundBlocks.TEMPO_RANGE = {min: 20, max: 500};

 /** The minimum and maximum values for each sound effect.
 * @type {{effect:{min: number, max: number}}}
 */
Scratch3SoundBlocks.EFFECT_RANGE = {
    pitch: {min: -600, max: 600},       // -5 to 5 octaves
    pan: {min: -100, max: 100},         // 100% left to 100% right
    echo: {min: 0, max: 100},           // 0 to max (75%) feedback
    reverb: {min: 0, max: 100},         // wet/dry: 0 to 100% wet
    fuzz: {min: 0, max: 100},           // wed/dry: 0 to 100% wet
    robot: {min: 0, max: 600}           // 0 to 5 octaves
};

/**
 * @param {Target} target - collect sound state for this target.
 * @returns {SoundState} the mutable sound state associated with that target. This will be created if necessary.
 * @private
 */
Scratch3SoundBlocks.prototype._getSoundState = function (target) {
    var soundState = target.getCustomState(Scratch3SoundBlocks.STATE_KEY);
    if (!soundState) {
        soundState = Clone.simple(Scratch3SoundBlocks.DEFAULT_SOUND_STATE);
        target.setCustomState(Scratch3SoundBlocks.STATE_KEY, soundState);
    }
    return soundState;
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
        sound_volume: this.getVolume,
        sound_settempotobpm: this.setTempo,
        sound_changetempoby: this.changeTempo,
        sound_tempo: this.getTempo
    };
};

Scratch3SoundBlocks.prototype.playSound = function (args, util) {
    var index = this._getSoundIndex(args.SOUND_MENU, util);
    if (index >= 0) {
        var md5 = util.target.sprite.sounds[index].md5;
        if (util.target.audioPlayer === null) return;
        util.target.audioPlayer.playSound(md5);
    }
};

Scratch3SoundBlocks.prototype.playSoundAndWait = function (args, util) {
    var index = this._getSoundIndex(args.SOUND_MENU, util);
    if (index >= 0) {
        var md5 = util.target.sprite.sounds[index].md5;
        if (util.target.audioPlayer === null) return;
        return util.target.audioPlayer.playSound(md5);
    }
};

Scratch3SoundBlocks.prototype._getSoundIndex = function (soundName, util) {
    // if the sprite has no sounds, return -1
    var len = util.target.sprite.sounds.length;
    if (len === 0) {
        return -1;
    }

    var index;

    // try to convert to a number and use that as an index
    var num = parseInt(soundName, 10);
    if (!isNaN(num)) {
        index = MathUtil.wrapClamp(num, 0, len - 1);
        return index;
    }

    // return the index for the sound of that name
    index = this.getSoundIndexByName(soundName, util);
    return index;
};

Scratch3SoundBlocks.prototype.getSoundIndexByName = function (soundName, util) {
    var sounds = util.target.sprite.sounds;
    for (var i = 0; i < sounds.length; i++) {
        if (sounds[i].name === soundName) {
            return i;
        }
    }
    // if there is no sound by that name, return -1
    return -1;
};

Scratch3SoundBlocks.prototype.stopAllSounds = function (args, util) {
    if (util.target.audioPlayer === null) return;
    util.target.audioPlayer.stopAllSounds();
};

Scratch3SoundBlocks.prototype.playNoteForBeats = function (args, util) {
    var note = Cast.toNumber(args.NOTE);
    note = MathUtil.clamp(note, Scratch3SoundBlocks.MIDI_NOTE_RANGE.min, Scratch3SoundBlocks.MIDI_NOTE_RANGE.max);
    var beats = Cast.toNumber(args.BEATS);
    beats = this._clampBeats(beats);
    var soundState = this._getSoundState(util.target);
    var inst = soundState.currentInstrument;
    var vol = soundState.volume;
    if (typeof this.runtime.audioEngine === 'undefined') return;
    return this.runtime.audioEngine.playNoteForBeatsWithInstAndVol(note, beats, inst, vol);
};

Scratch3SoundBlocks.prototype.playDrumForBeats = function (args, util) {
    var drum = Cast.toNumber(args.DRUM);
    drum -= 1; // drums are one-indexed
    if (typeof this.runtime.audioEngine === 'undefined') return;
    drum = MathUtil.wrapClamp(drum, 0, this.runtime.audioEngine.numDrums);
    var beats = Cast.toNumber(args.BEATS);
    beats = this._clampBeats(beats);
    if (util.target.audioPlayer === null) return;
    return util.target.audioPlayer.playDrumForBeats(drum, beats);
};

Scratch3SoundBlocks.prototype.restForBeats = function (args) {
    var beats = Cast.toNumber(args.BEATS);
    beats = this._clampBeats(beats);
    if (typeof this.runtime.audioEngine === 'undefined') return;
    return this.runtime.audioEngine.waitForBeats(beats);
};

Scratch3SoundBlocks.prototype._clampBeats = function (beats) {
    return MathUtil.clamp(beats, Scratch3SoundBlocks.BEAT_RANGE.min, Scratch3SoundBlocks.BEAT_RANGE.max);
};

Scratch3SoundBlocks.prototype.setInstrument = function (args, util) {
    var soundState = this._getSoundState(util.target);
    var instNum = Cast.toNumber(args.INSTRUMENT);
    instNum -= 1; // instruments are one-indexed
    if (typeof this.runtime.audioEngine === 'undefined') return;
    instNum = MathUtil.wrapClamp(instNum, 0, this.runtime.audioEngine.numInstruments);
    soundState.currentInstrument = instNum;
    return this.runtime.audioEngine.instrumentPlayer.loadInstrument(soundState.currentInstrument);
};

Scratch3SoundBlocks.prototype.setEffect = function (args, util) {
    this._updateEffect(args, util, false);
};

Scratch3SoundBlocks.prototype.changeEffect = function (args, util) {
    this._updateEffect(args, util, true);
};

Scratch3SoundBlocks.prototype._updateEffect = function (args, util, change) {
    var effect = Cast.toString(args.EFFECT).toLowerCase();
    var value = Cast.toNumber(args.VALUE);

    var soundState = this._getSoundState(util.target);
    if (!soundState.effects.hasOwnProperty(effect)) return;

    if (change) {
        soundState.effects[effect] += value;
    } else {
        soundState.effects[effect] = value;
    }

    var effectRange = Scratch3SoundBlocks.EFFECT_RANGE[effect];
    soundState.effects[effect] = MathUtil.clamp(soundState.effects[effect], effectRange.min, effectRange.max);

    if (util.target.audioPlayer === null) return;
    util.target.audioPlayer.setEffect(effect, soundState.effects[effect]);
};

Scratch3SoundBlocks.prototype.clearEffects = function (args, util) {
    var soundState = this._getSoundState(util.target);
    for (var effect in soundState.effects) {
        if (!soundState.effects.hasOwnProperty(effect)) continue;
        soundState.effects[effect] = 0;
    }
    if (util.target.audioPlayer === null) return;
    util.target.audioPlayer.clearEffects();
};

Scratch3SoundBlocks.prototype.setVolume = function (args, util) {
    var volume = Cast.toNumber(args.VOLUME);
    this._updateVolume(volume, util);
};

Scratch3SoundBlocks.prototype.changeVolume = function (args, util) {
    var soundState = this._getSoundState(util.target);
    var volume = Cast.toNumber(args.VOLUME) + soundState.volume;
    this._updateVolume(volume, util);
};

Scratch3SoundBlocks.prototype._updateVolume = function (volume, util) {
    var soundState = this._getSoundState(util.target);
    volume = MathUtil.clamp(volume, 0, 100);
    soundState.volume = volume;
    if (util.target.audioPlayer === null) return;
    util.target.audioPlayer.setVolume(soundState.volume);
};

Scratch3SoundBlocks.prototype.getVolume = function (args, util) {
    var soundState = this._getSoundState(util.target);
    return soundState.volume;
};

Scratch3SoundBlocks.prototype.setTempo = function (args) {
    var tempo = Cast.toNumber(args.TEMPO);
    this._updateTempo(tempo);
};

Scratch3SoundBlocks.prototype.changeTempo = function (args) {
    var change = Cast.toNumber(args.TEMPO);
    if (typeof this.runtime.audioEngine === 'undefined') return;
    var tempo = change + this.runtime.audioEngine.currentTempo;
    this._updateTempo(tempo);
};

Scratch3SoundBlocks.prototype._updateTempo = function (tempo) {
    tempo = MathUtil.clamp(tempo, Scratch3SoundBlocks.TEMPO_RANGE.min, Scratch3SoundBlocks.TEMPO_RANGE.max);
    if (typeof this.runtime.audioEngine === 'undefined') return;
    this.runtime.audioEngine.setTempo(tempo);
};

Scratch3SoundBlocks.prototype.getTempo = function () {
    if (typeof this.runtime.audioEngine === 'undefined') return;
    return this.runtime.audioEngine.currentTempo;
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
