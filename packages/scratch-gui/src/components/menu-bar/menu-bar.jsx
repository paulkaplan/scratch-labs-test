const classNames = require('classnames');
const React = require('react');

const Box = require('../box/box.jsx');
const styles = require('./menu-bar.css');
const scratchLogo = require('./scratch-logo.svg');

const MenuBar = function MenuBar () {
    return (
        <Box
            className={classNames({
                [styles.menuBar]: true
            })}
        >
            <div className={classNames(styles.logoWrapper, styles.menuItem)}>
                <img
                    className={styles.scratchLogo}
                    src={scratchLogo}
                />
            </div>
            <div className={styles.menuItem} >Animation Playtest Prototype</div>
        </Box>
    );
};

module.exports = MenuBar;
