import React, { useContext } from 'react';
import { BasicFilters, AdvancedFilters } from './FilterCategories';
import UnifiedSearchField from './UnifiedSearchField';
import InfoTooltip from './InfoTooltip';
import { SearchContext } from '../contexts/SearchContext';

const StandardControls = () => {
  // EXCESSIVE COMMENTING: `showAdvanced` is pulled globally from SearchContext instead of local state. This ensures that unmounting the controls during Gateway Mode transitions doesn't destroy the menu state.
  const { clearSearch, showAdvanced, setShowAdvanced } = useContext(SearchContext);

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

        {/* EXCESSIVE COMMENTING: Added explicit `flexDirection: 'row'` here. A legacy CSS rule inside App.css for `.std-right-group` was forcing this entire block to render as a vertical column. This completely breaks the stacking loop. */}
        <div className="std-right-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', marginBottom: '2px', marginLeft: '10px' }}>
          <UnifiedSearchField />
          <button className="clear-button" style={{ margin: 0, padding: '5px 10px' }} onClick={clearSearch}>Clear</button>
          
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '3px' }}>
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