const React = require('react');

const Box = require('../box/box.jsx');
const SpriteInfo = require('../../containers/sprite-info.jsx');
const SpriteSelectorItem = require('../../containers/sprite-selector-item.jsx');
const styles = require('./sprite-selector.css');

const SpriteSelectorComponent = function (props) {
    const {
        onChangeSpriteDraggability,
        onChangeSpriteName,
        onChangeSpriteRotationStyle,
        onChangeSpriteVisibility,
        onChangeSpriteX,
        onChangeSpriteY,
        onSelectSprite,
        selectedId,
        sprites,
        ...componentProps
    } = props;
    let selectedSprite = sprites[selectedId];
    let spriteInfoDisabled = false;
    if (typeof selectedSprite === 'undefined') {
        selectedSprite = {};
        spriteInfoDisabled = true;
    }
    return (
        <Box
            className={styles.spriteSelector}
            {...componentProps}
        >
            <SpriteInfo
                disabled={spriteInfoDisabled}
                draggable={selectedSprite.draggable}
                name={selectedSprite.name}
                rotationStyle={selectedSprite.rotationStyle}
                visible={selectedSprite.visible}
                x={selectedSprite.x}
                y={selectedSprite.y}
                onChangeDraggability={onChangeSpriteDraggability}
                onChangeName={onChangeSpriteName}
                onChangeRotationStyle={onChangeSpriteRotationStyle}
                onChangeVisibility={onChangeSpriteVisibility}
                onChangeX={onChangeSpriteX}
                onChangeY={onChangeSpriteY}
            />

            <Box className={styles.scrollWrapper}>
                <Box className={styles.itemsWrapper}>
                    {Object.keys(sprites)
                        // Re-order by list order
                        .sort((id1, id2) => sprites[id1].order - sprites[id2].order)
                        .map(id => (
                            <SpriteSelectorItem
                                className={styles.sprite}
                                costumeURL={sprites[id].costume.skin}
                                id={id}
                                key={id}
                                name={sprites[id].name}
                                selected={id === selectedId}
                                onClick={onSelectSprite}
                            />
                        ))
                    }
                </Box>
            </Box>
        </Box>
    );
};

SpriteSelectorComponent.propTypes = {
    onChangeSpriteDraggability: React.PropTypes.func,
    onChangeSpriteName: React.PropTypes.func,
    onChangeSpriteRotationStyle: React.PropTypes.func,
    onChangeSpriteVisibility: React.PropTypes.func,
    onChangeSpriteX: React.PropTypes.func,
    onChangeSpriteY: React.PropTypes.func,
    onSelectSprite: React.PropTypes.func,
    selectedId: React.PropTypes.string,
    sprites: React.PropTypes.shape({
        id: React.PropTypes.shape({
            costume: React.PropTypes.shape({
                skin: React.PropTypes.string,
                name: React.PropTypes.string,
                bitmapResolution: React.PropTypes.number,
                rotationCenterX: React.PropTypes.number,
                rotationCenterY: React.PropTypes.number
            }),
            name: React.PropTypes.string,
            order: React.PropTypes.number
        })
    })
};

module.exports = SpriteSelectorComponent;
