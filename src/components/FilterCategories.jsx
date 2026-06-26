import React, { useContext, useState } from 'react';
import { SearchContext } from '../contexts/SearchContext';
import { useCogcOverlay } from '../contexts/CogcOverlayContext';
import { SelectionContext } from '../contexts/SelectionContext';
import { useDataPoints } from '../contexts/DataPointContext';
import { useMapMode, MAP_MODES } from '../contexts/MapModeContext';
import { cogcPrograms } from '../constants/cogcPrograms';
import ResourceThresholdFilter from './ResourceThresholdFilter';

const ToggleToken = ({ label, active, onClick, tooltip, className }) => (
  <button
    className={`toggle-token ${active ? 'active' : ''} ${className}`}
    onClick={onClick}
    data-tooltip={tooltip}
  >
    {label}
  </button>
);

const FilterCategory = ({ title, options, mouseoverText, selectedOptions, onChange }) => (
  <div className="filter-category">
    <h4>{title}</h4>
    <div className="toggle-group">
      {options.map((option, index) => (
        <ToggleToken
          key={option}
          label={option}
          active={selectedOptions.includes(option)}
          onClick={() => onChange(option)}
          tooltip={mouseoverText[index] || option}
          className={`toggle-token${index + 1}`}
        />
      ))}
    </div>
  </div>
);

const StarFilter = ({ activeValue, onChange }) => (
  <div className="filter-category">
    <h4>Min Stars</h4>
    <div className="toggle-group">
      {[0, 1, 2, 3].map((star, index) => (
        <ToggleToken
          key={star}
          label={`${star}★`}
          active={activeValue === star}
          onClick={() => onChange(star)}
          tooltip={`Minimum ${star} Star${star !== 1 ? 's' : ''}`}
          className={index === 0 ? 'toggle-token1' : index === 3 ? 'toggle-token2' : 'toggle-token-mid'}
        />
      ))}
    </div>
  </div>
);

const CogcFilter = ({ active, program, onToggle, onProgramChange }) => {
  const { setOverlayProgram } = useCogcOverlay();

  const handleProgramChange = (value) => {
    onProgramChange(value);
    if (value !== 'ALL' && value !== null) {
      setOverlayProgram(value);
    } else {
      setOverlayProgram(null);
    }
  };

  return (
    <div className="filter-category">
      <h4>Cogc Program</h4>
      <div className="cogc-filter-controls">
        <ToggleToken
          label="Cogc"
          active={active}
          onClick={onToggle}
          tooltip="Toggle Cogc Program filter, dropdown activates an overlay"
          className={`toggle-token1`}
        />
        <select
          value={program}
          onChange={(e) => handleProgramChange(e.target.value)}
        >
          {cogcPrograms.map((program) => (
            <option key={program.value} value={program.display}>
              {program.display}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

// EXCESSIVE COMMENTING: Recreated the scattered mapping overlay buttons inside a unified container to render cleanly on the Advanced Options line. 
const MapModesFilter = () => {
  const { isPathfindingEnabled, togglePathfinding } = useContext(SelectionContext);
  const { isOverlayVisible, toggleOverlayVisibility } = useDataPoints();
  const { activeMode, toggleMode } = useMapMode();

  return (
    <div className="filter-category">
      <h4>Map Overlays</h4>
      <div className="toggle-group">
        <ToggleToken
          label="Gateway Mode"
          active={activeMode === MAP_MODES.GATEWAY}
          onClick={toggleMode}
          tooltip="Toggle Gateway Planning Mode"
          className="toggle-token1"
        />
        <ToggleToken
          label="Pathfinding"
          active={isPathfindingEnabled}
          onClick={togglePathfinding}
          tooltip="Toggle Pathfinding Navigation"
          className="toggle-token-mid"
        />
        <ToggleToken
          label="Data Overlay"
          active={isOverlayVisible}
          onClick={toggleOverlayVisibility}
          tooltip="Toggle Meteor Density & System Names"
          className="toggle-token2"
        />
      </div>
    </div>
  );
};


export const BasicFilters = () => {
  const { filters, updateFilters } = useContext(SearchContext);
  const [cogcActive, setCogcActive] = useState(false);
  const { overlayProgram } = useCogcOverlay();

  const handleChange = (category, option) => {
    const newFilters = {
      ...filters,
      [category]: filters[category].includes(option)
        ? filters[category].filter(item => item !== option)
        : [...filters[category], option]
    };
    updateFilters(newFilters);
  };

  const handleMinStarsChange = (value) => {
    updateFilters({ ...filters, minStars: value });
  };

  const handleCogcToggle = () => {
    setCogcActive(!cogcActive);
    if (!cogcActive) {
      const programObject = cogcPrograms.find(program => program.display === overlayProgram);
      let programValue = programObject ? programObject.value : (overlayProgram == null ? 'ALL' : 'ALL');
      updateFilters({ ...filters, cogcProgram: [programValue] });
    } else {
      updateFilters({ ...filters, cogcProgram: [] });
    }
  };

  const handleCogcProgramChange = (value) => {
      if(cogcActive) {
        const valueToSet = cogcPrograms.find(program => program.display === value);
        updateFilters({ ...filters, cogcProgram: [valueToSet.value] });
      } else {
        updateFilters({ ...filters, cogcProgram: [] });
      }
  };

  return (
    <div className="filter-categories basic-filters-container" style={{ display: 'flex', alignItems: 'center' }}>
      <div className="filter-category">
        <h4>Features</h4>
        <div className="toggle-group">
          <ToggleToken
            label="Fertile"
            active={filters.planetType.includes('Fertile')}
            onClick={() => handleChange('planetType', 'Fertile')}
            tooltip="Fertile Planets"
            className="toggle-token"
          />
        </div>
      </div>
      <StarFilter
        activeValue={filters.minStars}
        onChange={handleMinStarsChange}
      />
      <CogcFilter
        active={cogcActive}
        onToggle={handleCogcToggle}
        onProgramChange={handleCogcProgramChange}
      />
    </div>
  );
};

export const AdvancedFilters = () => {
  const { filters, updateFilters } = useContext(SearchContext);

  const handleChange = (category, option) => {
    const newFilters = {
      ...filters,
      [category]: filters[category].includes(option)
        ? filters[category].filter(item => item !== option)
        : [...filters[category], option]
    };
    updateFilters(newFilters);
  };

  return (
    <div className="filter-categories advanced-filters-container" style={{ display: 'flex', width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap', borderTop: '1px solid #444', paddingTop: '5px', marginTop: '2px' }}>
      <FilterCategory
        title="Planet Type"
        options={['Rocky', 'Gaseous']}
        mouseoverText={['MCG', 'AEF']}
        selectedOptions={filters.planetType}
        onChange={option => handleChange('planetType', option)}
      />
      <FilterCategory
        title="Gravity"
        options={['Low', 'High']}
        mouseoverText={['MGC', 'BL']}
        selectedOptions={filters.gravity}
        onChange={option => handleChange('gravity', option)}
      />
      <FilterCategory
        title="Temperature"
        options={['Low', 'High']}
        mouseoverText={['INS', 'TSH']}
        selectedOptions={filters.temperature}
        onChange={option => handleChange('temperature', option)}
      />
      <FilterCategory
        title="Pressure"
        options={['Low', 'High']}
        mouseoverText={['SEA', 'HSE']}
        selectedOptions={filters.pressure}
        onChange={option => handleChange('pressure', option)}
      />
      <ResourceThresholdFilter />
      <MapModesFilter />
    </div>
  );
};