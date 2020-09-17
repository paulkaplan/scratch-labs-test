import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';

import Box from '../box/box.jsx';
import CloseButton from '../close-button/close-button.jsx';
import Spinner from '../spinner/spinner.jsx';
import {AlertLevels} from '../../lib/alerts/index.jsx';

import styles from './alert.css';

const closeButtonColors = {
    [AlertLevels.SUCCESS]: CloseButton.COLOR_GREEN,
    [AlertLevels.WARN]: CloseButton.COLOR_ORANGE
};

const AlertComponent = ({
    content,
    closeButton,
    extensionName,
    iconSpinner,
    iconURL,
    level,
    onCloseAlert,
    onReconnect,
    showReconnect
}) => (
    <Box
        className={classNames(styles.alert, styles[level])}
    >
        {/* TODO: implement Rtl handling */}
        {iconSpinner && (
            <Spinner className={styles.alertSpinner} />
        )}
        {iconURL && (
            <img
                className={styles.alertIcon}
                src={iconURL}
            />
        )}
        <div className={styles.alertMessage}>
            {extensionName ? (
                <FormattedMessage
                    defaultMessage="Scratch lost connection to {extensionName}."
                    description="Message indicating that an extension peripheral has been disconnected"
                    id="gui.alerts.lostPeripheralConnection"
                    values={{
                        extensionName: (
                            `${extensionName}`
                        )
                    }}
                />
            ) : content}
        </div>
        {showReconnect && (
            <button
                className={styles.alertConnectionButton}
                onClick={onReconnect}
            >
                <FormattedMessage
                    defaultMessage="Reconnect"
                    description="Button to reconnect the device"
                    id="gui.connection.reconnect"
                />
            </button>
        )}
        {closeButton && (
            <Box
                className={styles.alertCloseButtonContainer}
            >
                <CloseButton
                    className={classNames(styles.alertCloseButton)}
                    color={closeButtonColors[level]}
                    size={CloseButton.SIZE_LARGE}
                    onClick={onCloseAlert}
                />
            </Box>
        )}
    </Box>
);

AlertComponent.propTypes = {
    closeButton: PropTypes.bool,
    content: PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
    extensionName: PropTypes.string,
    iconSpinner: PropTypes.bool,
    iconURL: PropTypes.string,
    level: PropTypes.string,
    onCloseAlert: PropTypes.func.isRequired,
    onReconnect: PropTypes.func,
    showReconnect: PropTypes.bool
};

AlertComponent.defaultProps = {
    level: AlertLevels.WARN
};

export default AlertComponent;
