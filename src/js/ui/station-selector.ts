import { StationManager } from '../utils/station';
import { ES } from '../constants';

class StationSelector {
    private stationManager: StationManager | null = new StationManager();
    private isInitialized: boolean = false;
    private isExpanded: boolean = false;
    private stationListCreated: boolean = false; // Track if DOM has been created
    private eventDelegationHandler: ((event: Event) => void) | null = null;

    // Initialize the station selector
    async initialize() {
        if (this.isInitialized) return;

        try {

            // Pre-load station data on app startup and cache it locally
            await this.stationManager!.loadStations();

            // Set initial selected station from saved preference
            const savedStationId = this.stationManager!.getSelectedStation();
            if (savedStationId) {
                // Update main UI with saved station info
                this.updateMainStationDisplay(savedStationId);

                // Notify WebSocket service to switch to saved station
                if (window.wsService && typeof window.wsService.setStation === 'function') {
                    window.wsService.setStation(savedStationId);
                }

                // Notify waveform visualizer to update current station
                if (window.waveformVisualizer && typeof window.waveformVisualizer.setStation === 'function') {
                    window.waveformVisualizer.setStation(savedStationId);
                }
            } else {
                // No saved station, connect to default station
                const defaultStationId = ES.STATION.DEFAULT_ID; // Use default station

                // Update UI with default station
                this.updateSelectedStationUI(defaultStationId);

                // Notify WebSocket service to connect to default station
                if (window.wsService && typeof window.wsService.setStation === 'function') {
                    window.wsService.setStation(defaultStationId);
                }

                // Notify waveform visualizer to update current station
                if (window.waveformVisualizer && typeof window.waveformVisualizer.setStation === 'function') {
                    window.waveformVisualizer.setStation(defaultStationId);
                }
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
        const groupedStations = this.stationManager!.getESNetStationsGroupedByCity();

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
            (cityStations as any[]).forEach((station: any) => {
                const stationItem = document.createElement('div');
                stationItem.className = 'station-item';
                stationItem.dataset.stationId = station.id;

                // Check if this station is currently selected and add 'selected' class
                const currentSelectedStation = this.getSelectedStation();
                if (currentSelectedStation && currentSelectedStation === station.id) {
                    stationItem.classList.add('selected');
                }

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

        // Update city header selection state for current selected station
        const currentSelectedStation = this.getSelectedStation();
        if (currentSelectedStation) {
            this.updateCityHeaderSelection(currentSelectedStation);
        }

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
        this.eventDelegationHandler = (event: Event) => {
            const target = (event.target as Element)?.closest('.city-header, .station-item');
            if (!target) return;

            if (target.classList.contains('city-header')) {
                const city = (target as HTMLElement).dataset.city;
                if (city) {
                    this.toggleCity(city);
                }
            } else if (target.classList.contains('station-item')) {
                const stationId = (target as HTMLElement).dataset.stationId;
                if (stationId) {
                    this.selectStation(stationId);
                }
            }
        };

        // Add event delegation listener
        stationList.addEventListener('click', this.eventDelegationHandler);
    }

    // Toggle city expansion
    toggleCity(city: string) {
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
            if (!stationCard.contains(event.target as Node) && !stationSelection.contains(event.target as Node)) {
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
    selectStation(stationId: string) {
        if (!this.stationManager) return;

        // Update station manager
        this.stationManager.saveSelectedStation(stationId);

        // Update UI (data is available from cache)
        this.updateSelectedStationUI(stationId);

        // Update city header selection state
        this.updateCityHeaderSelection(stationId);

        // Collapse all cities
        const allCityStations = document.querySelectorAll('.city-stations');
        allCityStations.forEach(container => {
            container.classList.remove('expanded');
        });
        const allCityHeaders = document.querySelectorAll('.city-header');
        allCityHeaders.forEach(header => {
            header.classList.remove('expanded');
        });

        // Collapse selection
        this.collapseStationSelection();

        // Immediately clear waveform when switching stations
        if (window.waveformVisualizer && typeof window.waveformVisualizer.clearWaveform === 'function') {
            window.waveformVisualizer.clearWaveform();
        }

        // Notify WebSocket service to switch station
        if (window.wsService && typeof window.wsService.setStation === 'function') {
            window.wsService.setStation(stationId);
        }

        // Notify waveform visualizer to update current station
        if (window.waveformVisualizer && typeof window.waveformVisualizer.setStation === 'function') {
            window.waveformVisualizer.setStation(stationId);
        }

        // Emit event for other components
        this.emitStationChange(stationId);
    }

    // Update main station display (station name and area on main interface)
    updateMainStationDisplay(stationId: string) {
        // Update station display
        const stationElement = document.getElementById('val-station');
        if (stationElement) {
            const stationInfo = this.stationManager!.getStationInfo(stationId);
            if (stationInfo && stationInfo.areaCode) {
                stationElement.textContent = `E-${stationInfo.areaCode}-${stationId}`;
            } else {
                stationElement.textContent = `E-${stationId}`;
            }
        }

        // Update area display
        const areaElement = document.getElementById('val-area');
        if (areaElement) {
            const stationInfo = this.stationManager!.getStationInfo(stationId);
            if (stationInfo && stationInfo.location) {
                areaElement.textContent = stationInfo.location;
            } else {
                areaElement.textContent = '未知區域';
            }
        }
    }

    // Update city header selection state
    updateCityHeaderSelection(stationId: string) {
        // Clear all city header selection states
        const allCityHeaders = document.querySelectorAll('.city-header');
        allCityHeaders.forEach(header => {
            header.classList.remove('selected');
        });

        // Find the city that contains the selected station
        const stationInfo = this.stationManager!.getStationInfo(stationId);
        if (stationInfo && stationInfo.location) {
            // Extract city from location (format: "縣市區鎮")
            let city = stationInfo.location;

            // Try to extract the city part (縣市) - match first occurrence of 縣 or 市
            const cityMatch = stationInfo.location.match(/^(.+?[縣市])/);
            if (cityMatch) {
                city = cityMatch[1]; // The city part
            }

            // Find and select the corresponding city header
            const cityHeader = document.querySelector(`.city-header[data-city="${city}"]`);
            if (cityHeader) {
                cityHeader.classList.add('selected');
            }
        }
    }

    // Update selected station UI (highlight selected station in list)
    updateSelectedStationUI(stationId: string) {
        // Clear all station selection states
        const allStationItems = document.querySelectorAll('.station-item');
        allStationItems.forEach(item => {
            item.classList.remove('selected');
        });

        // Find and select the corresponding station item
        const selectedStationItem = document.querySelector(`.station-item[data-station-id="${stationId}"]`);
        if (selectedStationItem) {
            selectedStationItem.classList.add('selected');
        }

        // Update main station display
        this.updateMainStationDisplay(stationId);
    }

    // Emit station change event
    emitStationChange(stationId: string) {
        const event = new CustomEvent('stationChanged', {
            detail: { stationId: stationId }
        });
        document.dispatchEvent(event);
    }

    // Get current selected station
    getSelectedStation() {
        return this.stationManager!.getSelectedStation();
    }

    // Get station info
    getStationInfo(stationId: string) {
        return this.stationManager!.getStationInfo(stationId);
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

export { StationSelector };