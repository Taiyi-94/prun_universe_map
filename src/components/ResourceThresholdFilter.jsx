import React, { useContext } from 'react';
import { SearchContext } from '../contexts/SearchContext';

const ResourceThresholdFilter = () => {
  const {
    resourceThreshold,
    setResourceThreshold,
    isRelativeThreshold,
    setIsRelativeThreshold,
    resourceTypeFilter,
    setResourceTypeFilter
  } = useContext(SearchContext);

  const handleThresholdChange = (event) => {
    const value = parseFloat(event.target.value);
    setResourceThreshold(isNaN(value) ? 0 : value);
  };

  const handleToggleChange = () => {
    setIsRelativeThreshold(!isRelativeThreshold);
  };

  const handleResourceTypeChange = (event) => {
    setResourceTypeFilter(event.target.value);
  };

  return (
    <div className="filter-category">
      <h4>Resource Filters</h4>
      {/* Joined segmented control: Relative | Type | Threshold input, with the % readout trailing on the right */}
      <div className="resource-filter-controls">
        <button
          className={`resource-relative-btn ${isRelativeThreshold ? 'active' : ''}`}
          onClick={handleToggleChange}
          data-tooltip="Relative to highest concentration (on) or absolute percentage (off)"
        >
          Relative
        </button>
        <select
          className="resource-type-select"
          value={resourceTypeFilter}
          onChange={handleResourceTypeChange}
        >
          <option value="ALL">All Types</option>
          <option value="GASEOUS">Gaseous</option>
          <option value="MINERAL">Mineral</option>
          <option value="LIQUID">Liquid</option>
        </select>
        <input
          type="number"
          min="0"
          max="1"
          step="0.05"
          value={resourceThreshold}
          onChange={handleThresholdChange}
          className="resource-threshold-input"
        />
        <span className="resource-threshold-value">{(resourceThreshold * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
};

export default ResourceThresholdFilter;