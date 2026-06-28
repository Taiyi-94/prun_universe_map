import * as d3 from 'd3';
import { resetGraphState } from '../utils/graphUtils';
import { colors } from '../config/config';
import { phaseMultiplier } from '../constants/phaseMultiplier';

export const clearHighlights = () => {
  d3.selectAll('.search-highlight')
    .classed('search-highlight', false)
    .attr('fill', colors.resetSystemFill)
    .attr('stroke', colors.resetSystemStroke)
    .attr('stroke-width', colors.resetSystemStrokeWidth);

  // EXCESSIVE COMMENTING: Actively scrub all dynamically generated percentage/star SVG text overlays whenever the map resets.
  d3.selectAll('.search-overlay-text').remove();

  resetGraphState();
};

export const highlightSearchResults = (searchResults, highestFactorLiquid, highestFactorGaseous, highestFactorMineral, isRelativeThreshold = false, resourceTypeFilter = 'ALL') => {
  console.log(highestFactorLiquid, highestFactorGaseous, highestFactorMineral)

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
    clearHighlights();

    const systemBestResource = {};
    const systemAllMaterials = {};

    // 1st Pass: Parse the best resource and group all material matches under their root system.
    searchResults.forEach(result => {
      if (result.type === 'material') {
        const systemId = result.systemId;
        
        // Collate everything to build the "15% / 10%" multiple-planet strings
        if (!systemAllMaterials[systemId]) systemAllMaterials[systemId] = [];
        systemAllMaterials[systemId].push(result);

        if (!systemBestResource[systemId]) {
          systemBestResource[systemId] = result;
        } else {
          const current = systemBestResource[systemId];
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

    const g = d3.select('#map-container svg g');

    // 2nd Pass: Handle node color highlighting
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

    // When the Relative threshold is active, the displayed concentration must be expressed as a
    // fraction of the best matching deposit (mirrors the relativeFactor logic in applyFiltersToResults),
    // rather than the raw absolute concentration shown when the toggle is off.
    let relativeMax = null;
    if (isRelativeThreshold) {
      const materials = searchResults.filter(r => r.type === 'material');
      if (materials.length > 0) {
        relativeMax = resourceTypeFilter === 'ALL'
          ? Math.max(...materials.map(r => r.factor * phaseMultiplier[r.resourceType]))
          : Math.max(...materials
              .filter(r => r.resourceType === resourceTypeFilter)
              .map(r => r.factor));
      }
    }

    const toDisplayFactor = (m) => {
      if (isRelativeThreshold && relativeMax) {
        return resourceTypeFilter === 'ALL'
          ? m.factor * phaseMultiplier[m.resourceType] / relativeMax
          : m.factor / relativeMax;
      }
      return m.factor;
    };

    // EXCESSIVE COMMENTING: 3rd Pass. Specifically for material queries, inject text overlay nodes directly into the SVG container representing the concentration % and planet star tier rating.
    Object.keys(systemAllMaterials).forEach(systemId => {
      // Order them logically from highest factor to lowest so the most important element is always first in the string sequence
      const mats = systemAllMaterials[systemId].sort((a, b) => toDisplayFactor(b) - toDisplayFactor(a));
      const rect = d3.select(`#${CSS.escape(systemId)}`);
      if (rect.empty()) return;

      const x = parseFloat(rect.attr('x'));
      const y = parseFloat(rect.attr('y'));
      const width = parseFloat(rect.attr('width'));
      const height = parseFloat(rect.attr('height'));
      const cx = x + width / 2;
      const cy = y + height / 2;

      // Map format: parseFloat dynamically drops ".0" so 14.0 becomes 14, keeping the map highly readable.
      const percText = mats.map(m => parseFloat((toDisplayFactor(m) * 100).toFixed(1)) + '%').join('/');
      const starText = mats.map(m => (m.planetTier !== undefined ? m.planetTier : '?') + '★').join('/');

      // Isolate the text node into a dedicated g-class wrapper ensuring mouse pointer events pass harmlessly through them into the underlying planet-node tooltip system!
      const textGroup = g.append('g')
        .attr('class', 'search-overlay-text')
        .style('pointer-events', 'none');

      // Top Row: Percentage
      textGroup.append('text')
        .attr('x', cx)
        .attr('y', cy - 1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'baseline')
        .attr('fill', '#ffffff')
        .attr('font-size', '5px')
        .attr('font-weight', 'bold')
        .attr('stroke', '#000000')
        .attr('stroke-width', '0.5px')
        .attr('paint-order', 'stroke')
        .text(percText);

      // Bottom Row: Stars
      textGroup.append('text')
        .attr('x', cx)
        .attr('y', cy + 1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'hanging')
        .attr('fill', '#f7a600')
        .attr('font-size', '4.5px')
        .attr('font-weight', 'bold')
        .attr('stroke', '#000000')
        .attr('stroke-width', '0.5px')
        .attr('paint-order', 'stroke')
        .text(starText);
    });
  }
};