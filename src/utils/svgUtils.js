import * as d3 from 'd3';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { BadgeCent, Anchor, Truck, BookOpen, Globe } from 'lucide-react';
import { colors } from '../config/config';

let universeData = null;
let planetData = null;
let universeMaxConcentrations = null;

// Function to fetch and process the universe and planet data
const fetchData = async () => {
  try {
    const [universeResponse, planetResponse] = await Promise.all([
      fetch('systemstars.json'),
      fetch('planet_data.json')
    ]);
    const universeJson = await universeResponse.json();
    const planetJson = await planetResponse.json();

    universeData = Object.fromEntries(universeJson.map(system => [system.SystemId, system]));

    // Group planets by SystemId
    planetData = planetJson.reduce((acc, planet) => {
      if (!acc[planet.SystemId]) {
        acc[planet.SystemId] = [];
      }
      acc[planet.SystemId].push(planet);
      return acc;
    }, {});

    universeMaxConcentrations = calculateMaxConcentrations(Object.values(planetData).flat());
  } catch (error) {
    console.error('Error loading data:', error);
  }
};

// Call this function when the application initializes
fetchData();

const calculateMaxConcentrations = (planets) => {
  const maxConc = {};

  planets.forEach(planet => {
    planet.Resources.forEach(resource => {
      const key = `${resource.MaterialId}-${resource.ResourceType}`;
      if (!maxConc[key] || resource.Factor > maxConc[key]) {
        maxConc[key] = resource.Factor;
      }
    });
  });

  return maxConc;
};

// Function to create facility indicator
const createFacilityIndicator = (hasFeature, IconComponent) => {
  const color = hasFeature ? '#f7a600' : '#3d3846';
  const iconElement = React.createElement(IconComponent, {
    size: 18,
    color: color,
    strokeWidth: 1.5,
    style: { marginRight: '2px' }
  });

  return ReactDOMServer.renderToString(iconElement);
};

const determinePlanetTier = (buildRequirements = []) => {
  // Distinct tickers; unknowns ignored
  const PENALTY = {
    SEA: 0,
    MCG: 0,
    BL: 1,
    INS: 1,
    HSE: 1,
    AEF: 1,
    MGC: 2,
    TSH: 2,
  };

  // De-duplicate tickers found in requirements
  const tickers = Array.from(new Set(
    (buildRequirements || [])
      .map(r => (r?.MaterialTicker || r?.Material || '').toUpperCase())
      .filter(Boolean)
  ));

  const totalPenalty = tickers.reduce((sum, t) => sum + (PENALTY[t] ?? 0), 0);
  const stars = Math.max(0, Math.min(3, 3 - totalPenalty));
  return stars; // 0..3
};


// Function to convert COGC program type to readable format
const formatCOGCProgram = (programType) => {
  if (!programType) return 'No active Program';
  return programType.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
};

// Function to create PlanetTier indicator
const createPlanetTierIndicator = (starCount) => {
  const total = 3;
  const filledStar = '★';
  const emptyStar = '☆';
  const filled = Math.max(0, Math.min(total, starCount | 0));
  const stars = filledStar.repeat(filled) + emptyStar.repeat(total - filled);
  return `<span class="planet-tier">${stars}</span>`;
};

// Function to create and show the info panel
const showInfoPanel = (rect, x, y, searchResults, materials, isRelativeThreshold) => {
  const isPlanetInSearchResults = (planetId) => {
    return searchResults.some(result =>
      (result.type === 'planet' && result.planetId === planetId) ||
      (result.type === 'material' && result.planetId === planetId)
    );
  };

  const findMatchingMaterials = (planetId) => {
    return searchResults.filter(result =>
      result.type === 'material' && result.planetId === planetId
    );
  };

  const createConcentrationBar = (concentration, materialId, resourceType, isRelative, maxConcentrations) => {
    const key = `${materialId}-${resourceType}`;
    const maxConcentration = maxConcentrations[key] || concentration;
    const percentage = isRelative ? (concentration / maxConcentration) * 100 : concentration * 100;
    const hue = (percentage / 100) * 120; // 0 is red, 120 is green
    const backgroundColor = `hsl(${hue}, 100%, 50%)`;

    return `
    <div class="concentration-bar-container" style="width: 100px; background-color: #ddd; height: 10px; margin-left: 5px;">
      <div class="concentration-bar" style="width: ${percentage}%; background-color: ${backgroundColor}; height: 100%;"></div>
    </div>
    <span class="resource-percentage">${percentage.toFixed(2)}%</span>
  `;
  };


  const systemId = rect.attr('id').replace('#', '');
  const system = universeData ? universeData[systemId] : null;
  const planets = planetData ? planetData[systemId] : null;

  if (!system || !planets) {
    console.error('System or planet data not found for:', systemId);
    return;
  }

  const infoPanel = d3.select('body').append('div')
    .attr('class', 'info-panel')
    .style('left', `${x}px`)
    .style('top', `${y}px`)
    .style('display', 'block');

  let content = `<h3>${system.Name} (${system.NaturalId})</h3>`;
  content += `<ul class="planet-list">`;

  // Sort planets alphabetically by PlanetNaturalId
  const sortedPlanets = planets.sort((a, b) => a.PlanetNaturalId.localeCompare(b.PlanetNaturalId));

  sortedPlanets.forEach(planet => {
    let planetTier = determinePlanetTier(planet.BuildRequirements);
    const isHighlighted = isPlanetInSearchResults(planet.PlanetNaturalId);
    const matchingMaterials = findMatchingMaterials(planet.PlanetNaturalId);

    content += `<li class="${isHighlighted ? 'highlighted-planet' : ''}">
      <div class="planet-info">
        <div class="planet-name-tier">
          <span class="planet-name">${planet.PlanetName} (${planet.PlanetNaturalId})</span>
          ${createPlanetTierIndicator(planetTier)}
        </div>
        <div class="facility-indicators">
          ${createFacilityIndicator(planet.HasLocalMarket, BadgeCent)}
          ${createFacilityIndicator(planet.HasChamberOfCommerce, Globe)}
          ${createFacilityIndicator(planet.HasWarehouse, Truck)}
          ${createFacilityIndicator(planet.HasAdministrationCenter, BookOpen)}
          ${createFacilityIndicator(planet.HasShipyard, Anchor)}
        </div>
      </div>`;
    if (planet.HasChamberOfCommerce) {
      let programType
      if (planet.COGCPrograms.length > 0) {
        const programs = planet.COGCPrograms;
        const sortedPrograms = programs.sort((a, b) => b.StartEpochMs - a.StartEpochMs);
        const currentProgram = sortedPrograms[1] || sortedPrograms[0] || null;
        programType = currentProgram.ProgramType;
      }
      const formattedProgram = formatCOGCProgram(programType);
      content += `<div class="cogc-program">CoGC: ${formattedProgram}</div>`;
    }
    // Add resource bars for matching materials
    if (matchingMaterials.length > 0) {
      content += `<div class="matching-resources">`;
      matchingMaterials.forEach(material => {
        const materialInfo = materials.find(m => m.MaterialId === material.id);
        const planetResource = planet.Resources.find(r => r.MaterialId === material.id);
        if (materialInfo && planetResource) {
          content += `
            <div class="resource-item" style="display: flex; align-items: center; margin-bottom: 5px;">
              <span class="resource-name" style="margin-right: 5px;">${materialInfo.Ticker}</span>
              ${createConcentrationBar(
            planetResource.Factor,
            planetResource.MaterialId,
            planetResource.ResourceType,
            isRelativeThreshold,
            universeMaxConcentrations
          )}
            </div>
          `;
        }
      });
      content += `</div>`;
    }
    content += `</li>`;
  });

  content += `</ul>`;
  infoPanel.html(content);
};

// Function to hide the info panel
const hideInfoPanel = () => {
  d3.select('.info-panel').remove();
};

// Function to add mouseover and mouseout events for animation
export const addMouseEvents = (g, searchResults, materials, isRelativeThreshold) => {
  g.selectAll('rect').each(function () {
    const rect = d3.select(this);
    const originalSize = { width: +rect.attr('width'), height: +rect.attr('height') };
    const originalPos = { x: +rect.attr('x'), y: +rect.attr('y') };
    let hoverTimer;
    let overlayOriginalSize, overlayOriginalPos;

    rect.on('mouseover.system', function (event) {
      if (rect.attr('id') === 'rect1' || d3.select(event.target).classed('data-overlay')) return;
      rect
        .attr('fill-opacity', 1)
        .attr('stroke-opacity', 1)
        .transition()
        .duration(200)
        .attr('width', originalSize.width * 2)
        .attr('height', originalSize.height * 2)
        .attr('x', originalPos.x - originalSize.width / 2)
        .attr('y', originalPos.y - originalSize.height / 2);

      const overlayRect = rect.property('cogcOverlayRect');

      if (overlayRect) {
        overlayOriginalSize = {
          width: +overlayRect.attr('width'),
          height: +overlayRect.attr('height')
        };
        overlayOriginalPos = {
          x: +overlayRect.attr('x'),
          y: +overlayRect.attr('y')
        };

        overlayRect
          .transition()
          .duration(200)
          .attr('width', overlayOriginalSize.width + originalSize.width)
          .attr('height', overlayOriginalSize.height + originalSize.width)
          .attr('x', overlayOriginalPos.x - originalSize.width / 2)
          .attr('y', overlayOriginalPos.y - originalSize.height / 2);
      }

      // Set timer for info panel
      hoverTimer = setTimeout(() => {
        const [x, y] = d3.pointer(event);
        showInfoPanel(rect, x, y, searchResults, materials, isRelativeThreshold);
      }, 400);

    }).on('mouseout.system', function (event) {
      if (rect.attr('id') === 'rect1') return;
      rect.transition()
        .duration(200)
        .attr('width', originalSize.width)
        .attr('height', originalSize.height)
        .attr('x', originalPos.x)
        .attr('y', originalPos.y)
        .attr('fill-opacity', rect.classed('search-highlight') ? 1 : colors.resetSystemFillOpacity);

      // Reset the overlay rect if it exists
      const overlayRect = rect.property('cogcOverlayRect');
      if (overlayRect) {
        overlayRect
          .transition()
          .duration(200)
          .attr('width', overlayOriginalSize.width)
          .attr('height', overlayOriginalSize.height)
          .attr('x', overlayOriginalPos.x)
          .attr('y', overlayOriginalPos.y);
      }

      // Clear timer and hide info panel
      clearTimeout(hoverTimer);
      hideInfoPanel();
    });
  });
};