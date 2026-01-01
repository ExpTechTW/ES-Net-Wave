// Data Display Module
// Handles the display of seismic data information
const constants = require('../constants');

class DataDisplay {
    constructor() {
        this.isInitialized = false;
    }

    // Initialize data display
    initialize() {
        this.resetDisplay();
        this.isInitialized = true;
    }

    // Update intensity data in UI
    updateIntensityData(intensity, pga, timestamp) {
        if (!this.isInitialized) return;

        // Update intensity
        const intensityElement = document.getElementById('val-int');
        if (intensityElement) {
            intensityElement.textContent = intensity.toFixed(1);
        }

        // Update PGA
        const pgaElement = document.getElementById('val-pga');
        if (pgaElement) {
            pgaElement.textContent = pga.toFixed(2);
        }

        // Update intensity level
        const intensityLevelElement = document.getElementById('val-int-level');
        if (intensityLevelElement) {
            const level = constants.WAVEFORM_CONSTANTS.getIntensityLevel(intensity);
            intensityLevelElement.textContent = level;
        }

        // Update time
        const timeElement = document.getElementById('val-time');
        if (timeElement) {
            const date = new Date(Number(timestamp));
            const timeStr = date.toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/\//g, '-');
            timeElement.innerHTML = timeStr.replace(' ', '<br>');
        }
    }

    // Update connection status
    updateConnectionStatus(status) {
        if (!this.isInitialized) return;

        const statusElement = document.getElementById('val-status');
        if (statusElement) {
            if (status === 'connected') {
                statusElement.textContent = '🟢 Connected';
            } else if (status === 'disconnected') {
                statusElement.textContent = '🔴 Disconnected';
                this.resetDisplay();
            } else if (status === 'error') {
                statusElement.textContent = '🔴 Error';
                this.resetDisplay();
            }
        }
    }

    // Update data status (Connected vs No Data)
    updateDataStatus(hasData) {
        if (!this.isInitialized) return;

        const statusElement = document.getElementById('val-status');
        if (statusElement) {
            if (hasData) {
                statusElement.textContent = '🟢 Connected';
            } else {
                statusElement.textContent = '🟡 No Data';
                this.resetDisplay();
            }
        }
    }

    // Reset data display to default values
    resetDisplay() {
        const intensityElement = document.getElementById('val-int');
        if (intensityElement) {
            intensityElement.textContent = '----';
        }

        const pgaElement = document.getElementById('val-pga');
        if (pgaElement) {
            pgaElement.textContent = '----';
        }

        const intensityLevelElement = document.getElementById('val-int-level');
        if (intensityLevelElement) {
            intensityLevelElement.textContent = '--';
        }

        const timeElement = document.getElementById('val-time');
        if (timeElement) {
            timeElement.innerHTML = '----/--/--<br>--:--:--';
        }
    }

    // Update station information
    updateStationInfo(station) {
        if (!this.isInitialized) return;

        const stationElement = document.getElementById('val-station');
        if (stationElement) {
            stationElement.textContent = 'E-310-' + station;
        }
    }

    // Initialize UI elements
    initializeUI() {
        // Set initial status
        const statusElement = document.getElementById('val-status');
        if (statusElement) {
            statusElement.textContent = '🔴 Disconnected';
        }

        // Set initial station
        const stationElement = document.getElementById('val-station');
        if (stationElement) {
            stationElement.textContent = 'E-310-' + constants.WAVEFORM_CONSTANTS.STATION.DEFAULT_ID;
        }
    }

    // Cleanup
    destroy() {
        this.isInitialized = false;
    }
}

module.exports = DataDisplay;