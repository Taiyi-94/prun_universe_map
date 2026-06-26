import React, { useState, useContext } from 'react';
import { BasicFilters, AdvancedFilters } from './FilterCategories';
import UnifiedSearchField from './UnifiedSearchField';
import InfoTooltip from './InfoTooltip';
import { SearchContext } from '../contexts/SearchContext';

const StandardControls = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { clearSearch } = useContext(SearchContext);

  // EXCESSIVE COMMENTING: The `std-top-row` utilizes `alignItems: 'flex-end'` specifically to sink the bottoms of all contained elements to the same pixel-line. Since the `BasicFilters` pill buttons have an `<h4>` label pushing them down, this flex configuration guarantees the search bar, clear button, and Info SVG all sit perfectly flush with the bottom of the pill buttons, eliminating the vertical jitter.
  return (
    <div className="standard-controls-container" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      
      <div className="std-top-row" style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '5px' }}>
        
        {/* Left Side: Buttons & Filters */}
        <div className="std-left-group" style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
          <button
            className="filter-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ marginBottom: '2px' }}
          >
            {showAdvanced ? 'Hide Advanced' : 'Advanced Options'}
          </button>
          <BasicFilters />
        </div>

        {/* Right Side: Search, Clear & Info - Pushed right if needed, but left-aligning with gap flows best natively. */}
        <div className="std-right-group" style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '0px', marginBottom: '2px', marginLeft: '10px' }}>
          <UnifiedSearchField />
          <button className="clear-button" style={{ margin: '0 0 0 5px', padding: '6px 10px' }} onClick={clearSearch}>Clear</button>
          
          {/* EXCESSIVE COMMENTING: The Info SVG wrapper uses a slight 5px bottom margin to center its internal geometric icon precisely with the text centerline of the input box next to it. */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px', marginLeft: '10px' }}>
             <InfoTooltip />
          </div>
        </div>

      </div>

      {showAdvanced && (
        <div className="std-bottom-row" style={{ width: '100%' }}>
          <AdvancedFilters />
        </div>
      )}
    </div>
  );
};

export default StandardControls;