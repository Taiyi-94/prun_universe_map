import * as d3 from 'd3';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { BadgeCent, Anchor, Truck, BookOpen, Globe } from 'lucide-react';
import { colors } from '../config/config';

let universeData = null;
let planetData = null;

// Function to fetch and process the universe and planet data
const fetchData = async () => {
  try {
    const [universeResponse, planetResponse] = await Promise.all([
      fetch('/prun_universe_data.json'),
      fetch('/planet_data.json')
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

    console.log('Universe and planet data loaded');
  } catch (error) {
    console.error('Error loading data:', error);
  }
};

// Call this function when the application initializes
fetchData();

// Function to normalize the style attribute
export const normalizeElementStyles = (element) => {
  const style = element.attrib.get('style', '');
  const styleDict = Object.fromEntries(style.split(';').filter(Boolean).map(item => item.split(':').map(str => str.trim())));

  for (const [key, value] of Object.entries(styleDict)) {
    element.setAttribute(key, value);
  }

  element.removeAttribute('style');
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

 const determinePlanetTier = (buildRequirements) => {
  const tier4 = ['TSH'];
  const tier3 = ['MGC', 'BL', 'HSE', 'INS'];
  const tier2 = ['SEA'];

  for (const requirement of buildRequirements) {
    const ticker = requirement.MaterialTicker;
    if (tier4.includes(ticker)) {
      return 4;
    } else if (tier3.includes(ticker)) {
      return 3;
    } else if (tier2.includes(ticker)) {
      return 2;
    }
  }

  return 1; // Default to tier 1 if no matches
};


// Function to convert COGC program type to readable format
const formatCOGCProgram = (programType) => {
  if (!programType) return 'Unknown Program';
  return programType.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
};

// Function to create PlanetTier indicator
const createPlanetTierIndicator = (tier) => {
  const maxTier = 4;
  const filledStar = '★';
  const emptyStar = '☆';
  const stars = filledStar.repeat(maxTier - tier) + emptyStar.repeat(Math.max(0, tier - 1));
  return `<span class="planet-tier">${stars}</span>`;
};

// Function to create and show the info panel
const showInfoPanel = (rect, x, y) => {
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

    content += `<li>
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
    if (planet.COGCProgramStatus === "ACTIVE" && planet.COGCPrograms && planet.COGCPrograms.length > 0) {
      const programType = planet.COGCPrograms[0].ProgramType;
      const formattedProgram = formatCOGCProgram(programType);
      content += `<div class="cogc-program">CoGC: ${formattedProgram}</div>`;
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
export const addMouseEvents = (g) => {
  g.selectAll('rect').each(function() {
    const rect = d3.select(this);
    const originalSize = { width: +rect.attr('width'), height: +rect.attr('height') };
    const originalPos = { x: +rect.attr('x'), y: +rect.attr('y') };
    let hoverTimer;

    rect.on('mouseover', function(event) {
      if (rect.attr('id') === 'rect1') return;
      rect
        .attr('fill-opacity', 1)
        .attr('stroke-opacity', 1)
        .transition()
        .duration(200)
        .attr('width', originalSize.width * 2)
        .attr('height', originalSize.height * 2)
        .attr('x', originalPos.x - originalSize.width / 2)
        .attr('y', originalPos.y - originalSize.height / 2);

      // Set timer for info panel
      hoverTimer = setTimeout(() => {
        const [x, y] = d3.pointer(event);
        showInfoPanel(rect, x, y);
      }, 400);

    }).on('mouseout', function() {
      if (rect.attr('id') === 'rect1') return;
      rect.transition()
        .duration(200)
        .attr('width', originalSize.width)
        .attr('height', originalSize.height)
        .attr('x', originalPos.x)
        .attr('y', originalPos.y)
        .attr('fill-opacity', colors.resetSystemFillOpacity);

      // Clear timer and hide info panel
      clearTimeout(hoverTimer);
      hideInfoPanel();
    });
  });
};