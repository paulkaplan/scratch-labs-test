const bindAll = require('lodash.bindall');
const React = require('react');

const LibraryItem = require('../library-item/library-item.jsx');
const ModalComponent = require('../modal/modal.jsx');

const styles = require('./library.css');

class LibraryComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSelect']);
        this.state = {selectedItem: null};
    }
    handleSelect (id) {
        if (this.state.selectedItem === id) {
            // Double select: select as the library's value.
            this.props.onRequestClose();
            this.props.onItemSelected(this.props.data[id]);
        } else {
            if (this.props.onItemChosen) {
                this.props.onItemChosen(this.props.data[id]);
            }
        }
        this.setState({selectedItem: id});
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
                                selected={this.state.selectedItem === itemId}
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
    data: React.PropTypes.arrayOf(
        /* eslint-disable react/no-unused-prop-types, lines-around-comment */
        React.PropTypes.shape({
            // @todo remove md5/rawURL prop from library, refactor to use storage
            md5: React.PropTypes.string,
            name: React.PropTypes.string.isRequired,
            rawURL: React.PropTypes.string
        })
        /* eslint-enable react/no-unused-prop-types, lines-around-comment */
    ),
    onItemChosen: React.PropTypes.func,
    onItemSelected: React.PropTypes.func,
    onRequestClose: React.PropTypes.func,
    title: React.PropTypes.string.isRequired,
    visible: React.PropTypes.bool.isRequired
};

module.exports = LibraryComponent;
