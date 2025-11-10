import * as d3 from 'd3';
import { resetGraphState } from '../utils/graphUtils';
import { colors } from '../config/config';

export const clearHighlights = () => {
  d3.selectAll('.search-highlight')
    .classed('search-highlight', false)
    .attr('fill', colors.resetSystemFill)
    .attr('stroke', colors.resetSystemStroke)
    .attr('stroke-width', colors.resetSystemStrokeWidth);

  resetGraphState();
};

export const highlightSearchResults = (searchResults, highestFactorLiquid, highestFactorGaseous, highestFactorMineral) => {
  // Define color scales
  const colorScaleLiquid = d3.scaleLinear()
    .domain([0, highestFactorLiquid])
    .range([colors.searchSystemFillLowLiquid, colors.searchSystemFillLiquid]);
  const colorScaleGaseous = d3.scaleLinear()
    .domain([0, highestFactorGaseous])
    .range([colors.searchSystemFillLowGaseous, colors.searchSystemFillGaseous]);
  const colorScaleMineral = d3.scaleLinear()
    .domain([0, highestFactorMineral])
    .range([colors.searchSystemFillLowMineral, colors.searchSystemFillMineral]);

  if (searchResults.length > 0) {
    // Reset all systems to default state
    clearHighlights();

    // Track the best resource for each system
    const systemBestResource = {};

    // First pass: determine the best resource to highlight for each system
    searchResults.forEach(result => {
      if (result.type === 'material') {
        const systemId = result.systemId;
        if (!systemBestResource[systemId]) {
          systemBestResource[systemId] = result;
        } else {
          const current = systemBestResource[systemId];
          // Simply keep the resource with the highest concentration
          if (result.factor > current.factor) {
            systemBestResource[systemId] = result;
          }
        }
      } else if (result.type === 'company_base') {
        const systemId = result.systemId;
        if (!systemBestResource[systemId]) {
          systemBestResource[systemId] = result;
        }
      }
    });

    // Second pass: highlight systems based on the best resource
    searchResults.forEach(result => {
      let highlightSystemNode = {};
      let fillColor = colors.searchSystemFill;
      let systemId;

      if (result.type === 'system') {
        systemId = result.id;
        highlightSystemNode = d3.select(`#${CSS.escape(systemId)}`);
      } else if (result.type === 'planet') {
        systemId = result.systemId;
        highlightSystemNode = d3.select(`#${CSS.escape(systemId)}`);
      } else if (result.type === 'material') {
        systemId = result.systemId;
        const bestForSystem = systemBestResource[systemId];

        if (result === bestForSystem) {
          if (result.resourceType === 'LIQUID') {
            fillColor = colorScaleLiquid(result.factor);
          } else if (result.resourceType === 'GASEOUS') {
            fillColor = colorScaleGaseous(result.factor);
          } else {
            fillColor = colorScaleMineral(result.factor);
          }
          highlightSystemNode = d3.select(`#${CSS.escape(systemId)}`);
        } else {
          // Skip this result as it's not the best for the system
          return;
        }
      } else if (result.type === 'company_base') {
        systemId = result.systemId;
        highlightSystemNode = d3.select(`#${CSS.escape(systemId)}`);
      }

      if (!highlightSystemNode.empty()) {
        highlightSystemNode
          .attr('fill', fillColor)
          .attr('stroke', colors.searchSystemStroke)
          .attr('stroke-width', colors.searchSystemStrokeWidth)
          .attr('fill-opacity', 1.0)
          .classed('search-highlight', true);
      }
    });
  }
};