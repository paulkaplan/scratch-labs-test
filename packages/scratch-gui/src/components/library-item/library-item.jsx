const classNames = require('classnames');
const bindAll = require('lodash.bindall');
const React = require('react');

const Box = require('../box/box.jsx');
const styles = require('./library-item.css');

class LibraryItem extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleClick']);
    }
    handleClick (e) {
        this.props.onSelect(this.props.id);
        e.preventDefault();
    }
    render () {
        return (
            <Box
                className={classNames({
                    [styles.libraryItem]: true,
                    [styles.isSelected]: this.props.selected
                })}
                onClick={this.handleClick}
            >
                <Box className={styles.libraryItemImageContainer}>
                    <img
                        className={styles.libraryItemImage}
                        src={this.props.iconURL}
                    />
                </Box>
                <span className={styles.libraryItemName}>{this.props.name}</span>
            </Box>
        );
    }
}

LibraryItem.propTypes = {
    iconURL: React.PropTypes.string.isRequired,
    id: React.PropTypes.number.isRequired,
    name: React.PropTypes.string.isRequired,
    onSelect: React.PropTypes.func.isRequired,
    selected: React.PropTypes.bool.isRequired
};

module.exports = LibraryItem;
