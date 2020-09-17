import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {AlertTypes} from '../lib/alerts/index.jsx';

import {
    closeAlert
} from '../reducers/alerts';

import AlertsComponent from '../components/alerts/alerts.jsx';

const Alerts = ({
    alertsList,
    className,
    onCloseAlert
}) => (
    <AlertsComponent
        // only display standard and extension alerts here
        alertsList={alertsList.filter(curAlert => (
            curAlert.alertType === AlertTypes.STANDARD ||
            curAlert.alertType === AlertTypes.EXTENSION
        ))}
        className={className}
        onCloseAlert={onCloseAlert}
    />
);

Alerts.propTypes = {
    alertsList: PropTypes.arrayOf(PropTypes.object),
    className: PropTypes.string,
    onCloseAlert: PropTypes.func
};

const mapStateToProps = state => ({
    alertsList: state.scratchGui.alerts.alertsList
});

const mapDispatchToProps = dispatch => ({
    onCloseAlert: index => dispatch(closeAlert(index))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(Alerts);
