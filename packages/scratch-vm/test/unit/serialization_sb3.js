const test = require('tap').test;
const path = require('path');
const VirtualMachine = require('../../src/index');
const sb3 = require('../../src/serialization/sb3');
const readFileToBuffer = require('../fixtures/readProjectFile').readFileToBuffer;
const exampleProjectPath = path.resolve(__dirname, '../fixtures/clone-cleanup.sb2');
const commentsSB2ProjectPath = path.resolve(__dirname, '../fixtures/comments.sb2');

test('serialize', t => {
    const vm = new VirtualMachine();
    vm.loadProject(readFileToBuffer(exampleProjectPath))
        .then(() => {
            const result = sb3.serialize(vm.runtime);
            // @todo Analyze
            t.type(JSON.stringify(result), 'string');
            t.end();
        });
});

test('deserialize', t => {
    const vm = new VirtualMachine();
    sb3.deserialize('', vm.runtime).then(({targets}) => {
        // @todo Analyze
        t.type(targets, 'object');
        t.end();
    });
});


test('serialize sb2 project with comments as sb3', t => {
    const vm = new VirtualMachine();
    vm.loadProject(readFileToBuffer(commentsSB2ProjectPath))
        .then(() => {
            const result = sb3.serialize(vm.runtime);

            t.type(JSON.stringify(result), 'string');
            t.type(result.targets, 'object');
            t.equal(Array.isArray(result.targets), true);
            t.equal(result.targets.length, 2);

            const stage = result.targets[0];
            t.equal(stage.isStage, true);
            // The stage has 0 blocks, and 1 workspace comment
            t.type(stage.blocks, 'object');
            t.equal(Object.keys(stage.blocks).length, 0);
            t.type(stage.comments, 'object');
            t.equal(Object.keys(stage.comments).length, 1);
            const stageBlockComments = Object.values(stage.comments).filter(comment => !!comment.blockId);
            const stageWorkspaceComments = Object.values(stage.comments).filter(comment => comment.blockId === null);
            t.equal(stageBlockComments.length, 0);
            t.equal(stageWorkspaceComments.length, 1);

            const sprite = result.targets[1];
            t.equal(sprite.isStage, false);
            t.type(sprite.blocks, 'object');
            // Sprite 1 has 6 blocks, 5 block comments, and 1 workspace comment
            t.equal(Object.keys(sprite.blocks).length, 6);
            t.type(sprite.comments, 'object');
            t.equal(Object.keys(sprite.comments).length, 6);

            const spriteBlockComments = Object.values(sprite.comments).filter(comment => !!comment.blockId);
            const spriteWorkspaceComments = Object.values(sprite.comments).filter(comment => comment.blockId === null);
            t.equal(spriteBlockComments.length, 5);
            t.equal(spriteWorkspaceComments.length, 1);

            t.end();
        });
});
