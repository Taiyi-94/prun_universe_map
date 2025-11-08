import React, { useContext, useState } from 'react';
import UniverseMap from './components/UniverseMap';
import Sidebar from './components/Sidebar';
import PathfindingToggle from './components/PathfindingToggle';
import MeteorDensityToggle from './components/MeteorDensityToggle';
import SearchField from './components/SearchField';
import MaterialSearchField from './components/MaterialSearchField';
import FilterCategories from './components/FilterCategories';
import InfoTooltip from './components/InfoTooltip';
import { GraphProvider } from './contexts/GraphContext';
import { SelectionProvider } from './contexts/SelectionContext';
import { SearchProvider, SearchContext } from './contexts/SearchContext';
import { CogcOverlayProvider } from './contexts/CogcOverlayContext';
import { DataPointProvider } from './contexts/DataPointContext';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import LoginForm from './components/LoginForm';
import './App.css';
import './components/FilterCategories.css';
import logo from './logo.png';

const App = () => {
  const [showFilters, setShowFilters] = useState(window.innerWidth > 768);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  return (
    <AuthProvider>
      <GraphProvider>
        <SelectionProvider>
          <SearchProvider>
            <CogcOverlayProvider>
              <DataPointProvider>
                <AppContent
                  showFilters={showFilters}
                  setShowFilters={setShowFilters}
                  isLoginOpen={isLoginOpen}
                  onOpenLogin={() => setIsLoginOpen(true)}
                  onCloseLogin={() => setIsLoginOpen(false)}
                />
              </DataPointProvider>
            </CogcOverlayProvider>
          </SearchProvider>
        </SelectionProvider>
      </GraphProvider>
    </AuthProvider>
  );
};

const AppContent = ({ showFilters, setShowFilters, isLoginOpen, onOpenLogin, onCloseLogin }) => {
  const { clearSearch, isCompanySearch, toggleCompanySearch } = useContext(SearchContext);
  const { isAuthenticated, userName, logout, authLoading } = useContext(AuthContext);

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <img src={logo} alt="Logo" className="App-logo" />
          <h1>Taiyi's Prosperous Universe Map</h1>
        </div>
        <div className="header-center">
          <button
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {showFilters && <FilterCategories />}
        </div>
        <div className="header-right">
          <MaterialSearchField />
          <SearchField />
        </div>
        <div className="header-buttons">
          <button className="clear-button" onClick={clearSearch}>Clear</button>
          <button
            onClick={toggleCompanySearch}
            className={`toggle-token company-search-toggle ${isCompanySearch ? 'active' : ''}`}
            data-tooltip={"Enter company code to search base data using FIO"}
          >
            Company
          </button>
        </div>
        <div className="header-auth">
          {isAuthenticated ? (
            <>
              <span className="auth-username" title={userName || 'Authenticated user'}>
                {userName || 'Signed in'}
              </span>
              <button
                className="auth-button logout-button"
                onClick={logout}
                disabled={authLoading}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              className="auth-button login-button"
              onClick={onOpenLogin}
            >
              Login
            </button>
          )}
        </div>
        <div className="header-info">
          <InfoTooltip />
          <div className="toggle-stack-container">
            <div className="pathfinding-toggle-container">
              <PathfindingToggle />
            </div>
            <div className="pathfinding-toggle-container">
              <MeteorDensityToggle />
            </div>
          </div>
        </div>
      </header>
      <div className="main-content">
        <UniverseMap />
        <Sidebar />
      </div>
      {isLoginOpen && !isAuthenticated && (
        <LoginForm onClose={onCloseLogin} />
      )}
    </div>
  );
};

export default App;