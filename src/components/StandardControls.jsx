import React, { useState, useContext } from 'react';
import FilterCategories from './FilterCategories';
import UnifiedSearchField from './UnifiedSearchField';
import { SearchContext } from '../contexts/SearchContext';

const StandardControls = () => {
  const [showFilters, setShowFilters] = useState(window.innerWidth > 768);
  const { clearSearch } = useContext(SearchContext);

  // EXCESSIVE COMMENTING: The unified StandardControls now relies strictly on UnifiedSearchField. The deprecated toggle button for FIO company mode is entirely eradicated as the synthetic category approach handles that context switch automatically.
  return (
    <div className="standard-controls-container" style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
      
      {/* Mimics original .header-center */}
      <div className="std-center-group">
         <button
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {showFilters && <FilterCategories />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Mimics original .header-right */}
          <div className="std-right-group">
            <UnifiedSearchField />
          </div>

          {/* Mimics original .header-buttons */}
          <div className="std-buttons-group">
             <button className="clear-button" onClick={clearSearch}>Clear</button>
          </div>
      </div>
    </div>
  );
};

export default StandardControls;