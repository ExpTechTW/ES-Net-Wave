// Station Selector UI Component
// Handles station selection interface and interactions
const { StationManager } = require('../utils/station');

class StationSelector {
    constructor() {
        this.stationManager = new StationManager();
        this.isInitialized = false;
        this.isExpanded = false;
        this.stationListCreated = false; // Track if DOM has been created
    }

    // Initialize the station selector
    async initialize() {
        if (this.isInitialized) return;

        try {

            // Pre-load station data on app startup and cache it locally
            await this.stationManager.loadStations();

            // Set initial selected station from saved preference
            const savedStationId = this.stationManager.getSelectedStation();
            if (savedStationId) {
                // Update UI with saved station
                this.updateSelectedStationUI(savedStationId);
            }

            // Setup event handlers
            this.setupEventHandlers();

            this.isInitialized = true;

        } catch (error) {
            console.error('Failed to initialize station selector:', error);
        }
    }

    // Create station list UI (only once)
    createStationList() {
        // Only create if not already created
        if (this.stationListCreated) {
            return;
        }

        const stationList = document.getElementById('station-list');
        if (!stationList) {
            console.error('station-list element not found');
            return;
        }

        // Clear existing content
        stationList.innerHTML = '';

        // Get grouped stations
        const groupedStations = this.stationManager.getESNetStationsGroupedByCity();

        // Create city groups
        Object.entries(groupedStations).forEach(([city, cityStations]) => {
            // Create city header
            const cityHeader = document.createElement('div');
            cityHeader.className = 'city-header';
            cityHeader.dataset.city = city;
            cityHeader.textContent = city; // Add city name

            // Create city stations container
            const cityStationsContainer = document.createElement('div');
            cityStationsContainer.className = 'city-stations';
            cityStationsContainer.dataset.city = city;
            // Initially collapsed (no expanded class)

            // Create station items for this city
            cityStations.forEach(station => {
                const stationItem = document.createElement('div');
                stationItem.className = 'station-item';
                stationItem.dataset.stationId = station.id;

                // Create station ID element
                const stationId = document.createElement('div');
                stationId.className = 'station-id';
                stationId.textContent = `E-${station.areaCode}-${station.id}`;

                // Create station location element (town only, since we're grouped by city)
                // Extract town from location (format: "縣市區鎮")
                let townOnly = station.location;

                // Try to extract the administrative division (區/鎮/市/鄉)
                const townPattern = /(.+[縣市])(.+[區鎮市鄉])$/;
                const match = station.location.match(townPattern);
                if (match) {
                    townOnly = match[2]; // The administrative division part
                }

                const stationLocation = document.createElement('div');
                stationLocation.className = 'station-location';
                stationLocation.textContent = townOnly;

                // Append elements to station item
                stationItem.appendChild(stationId);
                stationItem.appendChild(stationLocation);

                cityStationsContainer.appendChild(stationItem);
            });

            stationList.appendChild(cityHeader);
            stationList.appendChild(cityStationsContainer);
        });

        // Use event delegation for better memory management
        this.setupEventDelegation();

        this.stationListCreated = true;
    }

    // Setup event delegation for better memory management
    setupEventDelegation() {
        const stationList = document.getElementById('station-list');
        if (!stationList) return;

        // Remove existing event listener if any
        if (this.eventDelegationHandler) {
            stationList.removeEventListener('click', this.eventDelegationHandler);
        }

        // Create new event delegation handler
        this.eventDelegationHandler = (event) => {
            const target = event.target.closest('.city-header, .station-item');
            if (!target) return;

            if (target.classList.contains('city-header')) {
                const city = target.dataset.city;
                if (city) {
                    this.toggleCity(city);
                }
            } else if (target.classList.contains('station-item')) {
                const stationId = target.dataset.stationId;
                if (stationId) {
                    this.selectStation(stationId);
                }
            }
        };

        // Add event delegation listener
        stationList.addEventListener('click', this.eventDelegationHandler);
    }

    // Toggle city expansion
    toggleCity(city) {
        const cityStationsContainer = document.querySelector(`.city-stations[data-city="${city}"]`);
        const cityHeader = document.querySelector(`.city-header[data-city="${city}"]`);

        if (cityStationsContainer && cityHeader) {
            const isExpanded = cityStationsContainer.classList.contains('expanded');

            if (isExpanded) {
                cityStationsContainer.classList.remove('expanded');
                cityHeader.classList.remove('expanded');
            } else {
                const allExpandedCities = document.querySelectorAll('.city-stations.expanded');
                const allExpandedHeaders = document.querySelectorAll('.city-header.expanded');

                allExpandedCities.forEach(container => {
                    container.classList.remove('expanded');
                });
                allExpandedHeaders.forEach(header => {
                    header.classList.remove('expanded');
                });

                cityStationsContainer.classList.add('expanded');
                cityHeader.classList.add('expanded');
            }
        }
    }

    // Setup event handlers
    setupEventHandlers() {
        const stationCard = document.getElementById('card-station');
        const stationSelection = document.getElementById('station-selection');
        const defaultCards = document.getElementById('default-cards');

        if (!stationCard || !stationSelection || !defaultCards) {
            console.error('Required elements not found for station selector');
            return;
        }

        // Station card click handler
        stationCard.addEventListener('click', () => {
            this.toggleStationSelection();
        });

        // Hide station list when clicking outside
        document.addEventListener('click', (event) => {
            if (!stationCard.contains(event.target) && !stationSelection.contains(event.target)) {
                this.collapseStationSelection();
            }
        });
    }

    // Toggle station selection visibility
    toggleStationSelection() {
        if (this.isExpanded) {
            this.collapseStationSelection();
        } else {
            this.expandStationSelection();
        }
    }

    // Expand station selection
    async expandStationSelection() {
        const stationSelection = document.getElementById('station-selection');
        const defaultCards = document.getElementById('default-cards');
        const stationCard = document.getElementById('card-station');

        if (stationSelection && defaultCards) {
            // Create station list UI (data is already cached)
            this.createStationList();

            stationSelection.classList.add('show');
            stationSelection.style.display = ''; // Remove inline style
            defaultCards.style.display = 'none';
            if (stationCard) stationCard.classList.add('expanded');
            this.isExpanded = true;
        }
    }

    // Collapse station selection
    collapseStationSelection() {
        const stationSelection = document.getElementById('station-selection');
        const defaultCards = document.getElementById('default-cards');
        const stationCard = document.getElementById('card-station');

        if (stationSelection && defaultCards) {
            stationSelection.classList.remove('show');
            stationSelection.style.display = 'none'; // Ensure hidden
            defaultCards.style.display = 'flex';
            if (stationCard) stationCard.classList.remove('expanded');
            this.isExpanded = false;
        }
    }

    // Select a station
    selectStation(stationId) {
        if (!this.stationManager) return;

        // Update station manager
        this.stationManager.saveSelectedStation(stationId);

        // Update UI (data is available from cache)
        this.updateSelectedStationUI(stationId);

        // Collapse selection
        this.collapseStationSelection();

        // Notify WebSocket service to switch station
        if (window.wsService && typeof window.wsService.setStation === 'function') {
            window.wsService.setStation(stationId);
        }

        // Emit event for other components
        this.emitStationChange(stationId);
    }

    // Update selected station UI
    updateSelectedStationUI(stationId) {
        // Update station list visual selection (only if DOM exists)
        const stationItems = document.querySelectorAll('.station-item');
        stationItems.forEach(item => {
            if (item.dataset.stationId === stationId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Update station display
        const stationElement = document.getElementById('val-station');
        if (stationElement) {
            const stationInfo = this.stationManager.getStationInfo(stationId);
            if (stationInfo && stationInfo.areaCode) {
                stationElement.textContent = `E-${stationInfo.areaCode}-${stationId}`;
            } else {
                stationElement.textContent = `E-${stationId}`;
            }
        }

        // Update area display (data is always available from cache)
        const stationInfo = this.stationManager.getStationInfo(stationId);
        const areaElement = document.getElementById('val-area');
        if (areaElement) {
            if (stationInfo && stationInfo.location) {
                areaElement.textContent = stationInfo.location;
            } else {
                // Fallback if station not found in cache
                areaElement.textContent = '未知區域';
            }
        }
    }

    // Emit station change event
    emitStationChange(stationId) {
        const event = new CustomEvent('stationChanged', {
            detail: { stationId: stationId }
        });
        document.dispatchEvent(event);
    }

    // Get current selected station
    getSelectedStation() {
        return this.stationManager.getSelectedStation();
    }

    // Get station info
    getStationInfo(stationId) {
        return this.stationManager.getStationInfo(stationId);
    }

    // Cleanup
    destroy() {
        // Remove event delegation listener to prevent memory leaks
        const stationList = document.getElementById('station-list');
        if (stationList && this.eventDelegationHandler) {
            stationList.removeEventListener('click', this.eventDelegationHandler);
            this.eventDelegationHandler = null;
        }

        this.isInitialized = false;
        this.stationManager = null;
    }
}

module.exports = { StationSelector };