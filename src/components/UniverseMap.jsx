import React, { useEffect, useContext, useRef, useCallback, useState } from 'react';
import DataPointOverlay from './DataPointOverlay';
import GatewayLayer from './GatewayLayer';
import * as d3 from 'd3';
import { GraphContext } from '../contexts/GraphContext';
import { SelectionContext } from '../contexts/SelectionContext';
import { useCogcOverlay } from '../contexts/CogcOverlayContext';
import { useMapMode, MAP_MODES, GATEWAY_STRATEGIES } from '../contexts/MapModeContext';
import { addMouseEvents, drawGatewayHover } from '../utils/svgUtils'; // Import helper
import { resetGraphState, renderGatewayVisuals } from '../utils/graphUtils';
import { calculate3DDistance } from '../utils/distanceUtils';
import { cogcPrograms } from '../constants/cogcPrograms';
import './UniverseMap.css';
import { SearchContext } from '../contexts/SearchContext';

const CX_SYSTEMS = [
  '8ecf9670ba070d78cfb5537e8d9f1b6c', // Antares
  '92029ff27c1abe932bd2c61ee4c492c7', // Benten
  'f2f57766ebaca9d69efae41ccf4d8853', // Hortus
  '49b6615d39ccba05752b3be77b2ebf36', // Moria
  'a4ba8b12739da65efc2b518703652ee1', // Arclight
  'afda9bea7f948f4a066a8882cdfa9055'  // Hubur
];

const UniverseMap = React.memo(() => {
  const { graph, planetData, materials, universeData } = useContext(GraphContext);
  const { highlightSelectedSystem } = useContext(SelectionContext);
  const { overlayProgram } = useCogcOverlay();
  const { searchResults, isRelativeThreshold } = useContext(SearchContext);
  
  const { activeMode, gatewayData, setOriginById, addPlannedGateway, resetSelection, hoveredSystemId } = useMapMode();

  const svgRef = useRef(null);
  const graphRef = useRef(null);
  const [mapRenderKey, setMapRenderKey] = useState(0);

  const selectedProgramValue = cogcPrograms.find(program => program.display === overlayProgram)?.value;

  const handleSystemClick = useCallback((systemId) => {
    if (systemId === 'rect1') return;

    if (activeMode === MAP_MODES.STANDARD) {
        highlightSelectedSystem(systemId);
    } 
    else if (activeMode === MAP_MODES.GATEWAY) {
        if (gatewayData.strategy === GATEWAY_STRATEGIES.SINGLE) {
            if (!gatewayData.originA) {
                setOriginById(systemId, 'A');
            } else {
                if (gatewayData.originA.SystemId === systemId) {
                    resetSelection();
                } else {
                    const targetSystem = universeData[systemId][0];
                    const dist = calculate3DDistance(gatewayData.originA, targetSystem);
                    
                    addPlannedGateway({
                        id: Date.now().toString(),
                        sourceId: gatewayData.originA.SystemId,
                        targetId: targetSystem.SystemId,
                        source: gatewayData.originA.Name,
                        target: targetSystem.Name,
                        distance: dist.toFixed(2)
                    });
                    
                    resetSelection();
                }
            }
        } 
        else if (gatewayData.strategy === GATEWAY_STRATEGIES.DUAL) {
            if (!gatewayData.originA) {
                setOriginById(systemId, 'A');
            } else if (!gatewayData.originB) {
                if (gatewayData.originA.SystemId !== systemId) {
                    setOriginById(systemId, 'B');
                }
            } else {
                resetSelection(); 
                // setOriginById(systemId, 'A'); 
            }
        }
    }
  }, [activeMode, gatewayData, highlightSelectedSystem, setOriginById, addPlannedGateway, resetSelection, universeData]);

  const attachClickEvents = useCallback((g) => {
    g.selectAll('rect').on('click', function() {
      const systemId = d3.select(this).attr('id').replace('#', '');
      handleSystemClick(systemId);
    });
  }, [handleSystemClick]);

  useEffect(() => {
    if (!graph || !graph.edges) return;

    d3.xml(`${process.env.PUBLIC_URL}/PrUn_universe_map_normalized.svg`).then(data => {
      const svgNode = data.documentElement;
      const container = document.getElementById('map-container');

      while (container.firstChild) container.removeChild(container.firstChild);
      container.appendChild(svgNode);

      const svg = d3.select(svgNode);
      const g = svg.append('g');

      while (svgNode.firstChild && svgNode.firstChild !== g.node()) {
        g.node().appendChild(svgNode.firstChild);
      }

      g.selectAll('rect').each(function() {
        const systemId = d3.select(this).attr('id');
        if (CX_SYSTEMS.includes(systemId)) {
          d3.select(this).attr('rx', '2').attr('ry', '2');
        }
      });

      graphRef.current = { svg, g };

      const zoom = d3.zoom()
        .scaleExtent([1, 20])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });

      svg.call(zoom);

      addMouseEvents(g, searchResults, materials, isRelativeThreshold, selectedProgramValue, activeMode, gatewayData, universeData);

      svgRef.current = svgNode;
      graphRef.current = { svg, g };

      attachClickEvents(g);
      
      setMapRenderKey(prev => prev + 1);
    });

    return () => {
      if (svgRef.current) {
        const container = document.getElementById('map-container');
        if (container && container.contains(svgRef.current)) {
          container.removeChild(svgRef.current);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]); 

  useEffect(() => {
    if (graphRef.current) {
      addMouseEvents(
          graphRef.current.g, 
          searchResults, 
          materials, 
          isRelativeThreshold, 
          selectedProgramValue,
          activeMode, 
          gatewayData,
          universeData
      );
      attachClickEvents(graphRef.current.g);
    }
  }, [searchResults, materials, isRelativeThreshold, selectedProgramValue, activeMode, gatewayData, attachClickEvents, universeData]);

  useEffect(() => {
    if (!graphRef.current || !universeData) return;
    const { svg } = graphRef.current;

    if (activeMode === MAP_MODES.GATEWAY) {
        renderGatewayVisuals(svg, gatewayData, universeData);
    } else {
        resetGraphState(null, activeMode, null, null);
    }
  }, [activeMode, gatewayData, universeData]);

  useEffect(() => {
      if (activeMode === MAP_MODES.GATEWAY && graphRef.current) {
          const { g } = graphRef.current;
          if (hoveredSystemId) {
              drawGatewayHover(g, hoveredSystemId, gatewayData, universeData);
          } else {
              g.selectAll('.rubber-band').remove();
          }
      }
  }, [hoveredSystemId, activeMode, gatewayData, universeData]);

  const applyCogcOverlay = useCallback(() => {
    if (!graphRef.current || !overlayProgram) return;
    const { g } = graphRef.current;
    g.selectAll('.cogc-overlay-rect').remove();

    g.selectAll('rect').each(function() {
      const rect = d3.select(this);
      const systemId = d3.select(this).attr('id');
      const planets = planetData[systemId];

      if (planets && planets.some(planet => {
        if (!planet.COGCPrograms || planet.COGCPrograms.length === 0) return false;
        const sortedPrograms = planet.COGCPrograms.sort((a, b) => b.StartEpochMs - a.StartEpochMs);
        const relevantProgram = sortedPrograms[1] || sortedPrograms[0];
        return relevantProgram && relevantProgram.ProgramType === selectedProgramValue;
      })) {
        rect.classed('cogc-overlay', true);
        const x = parseFloat(rect.attr('x'));
        const y = parseFloat(rect.attr('y'));
        const width = parseFloat(rect.attr('width'));
        const height = parseFloat(rect.attr('height'));
        const scaleUp = 4;
        const isCX = CX_SYSTEMS.includes(systemId);
        const borderRadius = isCX ? '4' : '50%';

        const overlayRect = g.append('rect')
          .attr('class', 'cogc-overlay-rect')
          .attr('x', x - scaleUp/2)
          .attr('y', y - scaleUp/2)
          .attr('width', width + scaleUp)
          .attr('height', height + scaleUp)
          .attr('fill', 'none')
          .attr('stroke', '#56c7f7')
          .attr('stroke-width', '3px')
          .attr('rx', borderRadius)
          .attr('ry', borderRadius);
        rect.property('cogcOverlayRect', overlayRect);
      } else {
        rect.classed('cogc-overlay', false);
        rect.property('cogcOverlayRect', null);
      }
    });
  }, [overlayProgram, planetData, selectedProgramValue]);

  useEffect(() => {
    applyCogcOverlay();
  }, [applyCogcOverlay]);

  return (
    <div id="map-container">
      <DataPointOverlay mapRef={graphRef} />
      <GatewayLayer mapRef={graphRef} mapRenderKey={mapRenderKey} /> 
    </div>
  );
});

export default UniverseMap;