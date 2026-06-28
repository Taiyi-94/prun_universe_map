import React, { useState } from 'react';
import UniverseMap from './components/UniverseMap';
import Sidebar from './components/Sidebar';
import StandardControls from './components/StandardControls';
import GatewayControls from './components/GatewayControls';
import { GraphProvider } from './contexts/GraphContext';
import { SelectionProvider } from './contexts/SelectionContext';
import { SearchProvider } from './contexts/SearchContext';
import { CogcOverlayProvider } from './contexts/CogcOverlayContext';
import { DataPointProvider } from './contexts/DataPointContext';
import { MapModeProvider, useMapMode, MAP_MODES } from './contexts/MapModeContext';
import logo from './logo.png';
import './App.css';
import './components/FilterCategories.css';

const App = () => {
  return (
    <GraphProvider>
      <SelectionProvider>
        <SearchProvider>
          <CogcOverlayProvider>
            <DataPointProvider>
              <MapModeProvider>
                 <AppContent />
              </MapModeProvider>
            </DataPointProvider>
          </CogcOverlayProvider>
        </SearchProvider>
      </SelectionProvider>
    </GraphProvider>
  );
};

const AppContent = () => {
  const { activeMode } = useMapMode();

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <img src={logo} alt="Logo" className="App-logo" />
          <h1>Taiyi's Prosperous Universe Map</h1>
        </div>
        
        {/* EXCESSIVE COMMENTING: The header center now consumes the entire remaining flex space, allowing StandardControls to organize the UI in a single horizontal swath. The right-hand stack panel was deleted. */}
        <div className="header-center" style={{ flex: '1 1 auto', justifyContent: 'flex-start', width: '100%', paddingLeft: '10px' }}>
            {activeMode === MAP_MODES.STANDARD ? <StandardControls /> : <GatewayControls />}
        </div>
      </header>
      
      <div className="main-content">
        <UniverseMap />
        <Sidebar />
      </div>
    </div>
  );
};

export default App;