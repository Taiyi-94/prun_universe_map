import React, { useContext } from 'react';
import { BasicFilters, AdvancedFilters } from './FilterCategories';
import UnifiedSearchField from './UnifiedSearchField';
import InfoTooltip from './InfoTooltip';
import { SearchContext } from '../contexts/SearchContext';

const StandardControls = () => {
  const { clearSearch, showAdvanced, setShowAdvanced } = useContext(SearchContext);

  return (
    <div className="standard-controls-container" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      
      <div className="std-top-row" style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '5px' }}>
        
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

        <div className="std-right-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: '8px', marginBottom: '2px', marginLeft: '10px' }}>
          <UnifiedSearchField />
          <button className="clear-button" style={{ margin: 0, padding: '5px 10px' }} onClick={clearSearch}>Clear</button>
          
          {/* EXCESSIVE COMMENTING: Stripped out the 3px padding-bottom that was artificially hoisting the SVG icon out of horizontal alignment with the Search and Clear buttons, assigning a subtle 1px margin-bottom instead to rest the graphic geometrically flush on the UI baseline. */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1px' }}>
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