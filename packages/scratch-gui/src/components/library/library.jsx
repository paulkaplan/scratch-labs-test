const bindAll = require('lodash.bindall');
const PropTypes = require('prop-types');
const React = require('react');

const LibraryItem = require('../library-item/library-item.jsx');
const ModalComponent = require('../modal/modal.jsx');

const styles = require('./library.css');

class LibraryComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleSelect',
            'handleMouseEnter',
            'handleMouseLeave'
        ]);
    }
    handleSelect (id) {
        this.props.onRequestClose();
        this.props.onItemSelected(this.props.data[id]);
    }
    handleMouseEnter (id) {
        if (this.props.onItemMouseEnter) this.props.onItemMouseEnter(this.props.data[id]);
    }
    handleMouseLeave (id) {
        if (this.props.onItemMouseLeave) this.props.onItemMouseLeave(this.props.data[id]);
    }
    render () {
        if (!this.props.visible) return null;
        return (
            <ModalComponent
                contentLabel={this.props.title}
                visible={this.props.visible}
                onRequestClose={this.props.onRequestClose}
            >
                <h1 className={styles.modalHeader}>{this.props.title}</h1>
                <div className={styles.libraryScrollGrid}>
                    {this.props.data.map((dataItem, itemId) => {
                        const scratchURL = dataItem.md5 ?
                            `https://cdn.assets.scratch.mit.edu/internalapi/asset/${dataItem.md5}/get/` :
                            dataItem.rawURL;
                        return (
                            <LibraryItem
                                iconURL={scratchURL}
                                id={itemId}
                                key={`item_${itemId}`}
                                name={dataItem.name}
                                onMouseEnter={this.handleMouseEnter}
                                onMouseLeave={this.handleMouseLeave}
                                onSelect={this.handleSelect}
                            />
                        );
                    })}
                </div>
            </ModalComponent>
        );
    }
}

LibraryComponent.propTypes = {
    data: PropTypes.arrayOf(
        /* eslint-disable react/no-unused-prop-types, lines-around-comment */
        PropTypes.shape({
            // @todo remove md5/rawURL prop from library, refactor to use storage
            md5: PropTypes.string,
            name: PropTypes.string.isRequired,
            rawURL: PropTypes.string
        })
        /* eslint-enable react/no-unused-prop-types, lines-around-comment */
    ),
    onItemMouseEnter: PropTypes.func,
    onItemMouseLeave: PropTypes.func,
    onItemSelected: PropTypes.func,
    onRequestClose: PropTypes.func,
    title: PropTypes.string.isRequired,
    visible: PropTypes.bool.isRequired
};

module.exports = LibraryComponent;
