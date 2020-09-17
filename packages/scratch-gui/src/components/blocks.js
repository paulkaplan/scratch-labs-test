const React = require('react');

class BlocksComponent extends React.Component {
    render () {
        return (
            <div
                ref={this.props.componentRef}
                className="scratch-blocks"
                style={{
                    position: 'absolute',
                    top: 0,
                    right: '40%',
                    bottom: 0,
                    left: 0
                }}
            />
        );
    }
}

BlocksComponent.propTypes = {
    componentRef: React.PropTypes.func
};

module.exports = BlocksComponent;
