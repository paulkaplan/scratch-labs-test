const bindAll = require('lodash.bindall');
const React = require('react');

const LibraryItem = require('./library-item');
const ModalComponent = require('./modal');

class LibraryComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['onSelect']);
        this.state = {selectedItem: null};
    }
    onSelect (id) {
        if (this.state.selectedItem == id) {
            // Double select: select as the library's value.
            this.props.onRequestClose();
            this.props.onItemSelected(this.props.data[id]);
        }
        this.setState({selectedItem: id});
    }
    render () {
        let itemId = 0;
        let gridItems = this.props.data.map((dataItem) => {
            let id = itemId;
            itemId++;
            const scratchURL = (dataItem.md5) ? 'https://cdn.assets.scratch.mit.edu/internalapi/asset/' +
                dataItem.md5 + '/get/' : dataItem.rawURL;
            return <LibraryItem
                name={dataItem.name}
                iconURL={scratchURL}
                key={'item_' + id}
                selected={this.state.selectedItem == id}
                onSelect={this.onSelect}
                id={id}
            />;
        });

        const scrollGridStyle = {
            overflow: 'scroll',
            position: 'absolute',
            top: '70px',
            bottom: '20px',
            left: '30px',
            right: '30px'
        };

        return (
            <ModalComponent
                onRequestClose={this.props.onRequestClose}
                visible={this.props.visible}
            >
                <h1>{this.props.title}</h1>
                <div style={scrollGridStyle}>
                    {gridItems}
                </div>
            </ModalComponent>
        );
    }
}

LibraryComponent.propTypes = {
    title: React.PropTypes.string,
    data: React.PropTypes.array,
    visible: React.PropTypes.bool,
    onRequestClose: React.PropTypes.func,
    onItemSelected: React.PropTypes.func
};

module.exports = LibraryComponent;
