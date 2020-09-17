const React = require('react');

class BlocksComponent extends React.Component {
    render () {
        const {
            componentRef,
            ...props
        } = this.props;
        return (
            <div
                ref={componentRef}
                className="scratch-blocks"
                style={{
                    position: 'absolute',
                    top: 0,
                    right: '40%',
                    bottom: 0,
                    left: 0
                }}
                {...props}
            />
        );
    }
}

BlocksComponent.propTypes = {
    componentRef: React.PropTypes.func
};

module.exports = BlocksComponent;
