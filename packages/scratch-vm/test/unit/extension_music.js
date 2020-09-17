const test = require('tap').test;
const Music = require('../../src/extensions/scratch3_music/index.js');
let playedDrum;
let playedInstrument;
const runtime = {
    audioEngine: {
        numInstruments: 3,
        instrumentPlayer: {
            loadInstrument: instrument => (playedInstrument = instrument)
        }
    }
};
const blocks = new Music(runtime);
blocks._playDrumNum = (util, drum) => (playedDrum = drum);

const util = {
    stackFrame: Object.create(null),
    target: {
        audioPlayer: null
    },
    yield: () => null
};

test('playDrum uses 1-indexing and wrap clamps', t => {
    let args = {DRUM: 1};
    blocks.playDrumForBeats(args, util);
    t.strictEqual(playedDrum, 0);

    args = {DRUM: blocks.DRUM_INFO.length + 1};
    blocks.playDrumForBeats(args, util);
    t.strictEqual(playedDrum, 0);

    t.end();
});

test('setInstrument uses 1-indexing and wrap clamps', t => {
    // Stub getMusicState
    blocks._getMusicState = () => ({});

    let args = {INSTRUMENT: 1};
    blocks.setInstrument(args, util);
    t.strictEqual(playedInstrument, 0);

    args = {INSTRUMENT: runtime.audioEngine.numInstruments + 1};
    blocks.setInstrument(args, util);
    t.strictEqual(playedInstrument, 0);

    t.end();
});
