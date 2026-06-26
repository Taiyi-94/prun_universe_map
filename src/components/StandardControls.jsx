import React, { useState, useContext } from 'react';
import { BasicFilters, AdvancedFilters } from './FilterCategories';
import UnifiedSearchField from './UnifiedSearchField';
import { SearchContext } from '../contexts/SearchContext';

const StandardControls = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { clearSearch } = useContext(SearchContext);

  return (
    <div className="standard-controls-container" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      
      {/* EXCESSIVE COMMENTING: Top Row holds the Advanced Toggle, the Basic Filters, the Unified Search Bar, and the Clear Button in a single responsive flex-line. */}
      <div className="std-top-row" style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '5px' }}>
        
        {/* Left Side: Buttons & Filters */}
        <div className="std-left-group" style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
          <button
            className="filter-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ marginBottom: '5px' }} /* Push the button down so it aligns elegantly with the actual pill buttons below the h4 headers */
          >
            {showAdvanced ? 'Hide Advanced' : 'Advanced Options'}
          </button>
          <BasicFilters />
        </div>

        {/* Right Side: Search & Clear */}
        <div className="std-right-group" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px', marginBottom: '2px' }}>
          <UnifiedSearchField />
          <button className="clear-button" onClick={clearSearch}>Clear</button>
        </div>

      </div>

      {/* EXCESSIVE COMMENTING: Bottom Row conditionally mounts the Advanced Filters beneath the main navigation header. */}
      {showAdvanced && (
        <div className="std-bottom-row" style={{ width: '100%' }}>
          <AdvancedFilters />
        </div>
      )}
    </div>
  );
};

export default StandardControls;