import { useEffect } from 'react';
import { useMapMode } from '../contexts/MapModeContext';
import { colors } from '../config/config';

const GatewayLayer = ({ mapRef, mapRenderKey }) => {
  const { existingGateways, gatewayData, activeMode } = useMapMode();

  useEffect(() => {
    if (!mapRef.current || mapRenderKey === 0) return;
    
    const { g } = mapRef.current;

    let bgGroup = g.select('.gateway-background-layer');
    
    if (bgGroup.empty()) {
        const firstSystemNode = g.select('rect:not(#rect1)').node();
        
        if (firstSystemNode) {
            bgGroup = g.insert('g', () => firstSystemNode)
                          .attr('class', 'gateway-background-layer');
        } else {
            bgGroup = g.append('g').attr('class', 'gateway-background-layer');
        }
    }
    bgGroup.selectAll('*').remove();

    let fgGroup = g.select('.gateway-foreground-layer');
    
    if (fgGroup.empty()) {
        fgGroup = g.append('g').attr('class', 'gateway-foreground-layer');
    } else {
        fgGroup.raise(); 
    }
    fgGroup.selectAll('*').remove();

    const getCoords = (systemId) => {
        const node = g.select(`#${CSS.escape(systemId)}`);
        if (node.empty()) return null;
        return {
            x: parseFloat(node.attr('x')) + parseFloat(node.attr('width')) / 2,
            y: parseFloat(node.attr('y')) + parseFloat(node.attr('height')) / 2
        };
    };

    if (existingGateways && existingGateways.length > 0) {
        existingGateways.forEach(gw => {
            const start = getCoords(gw.sourceId);
            const end = getCoords(gw.targetId);
            
            if (start && end) {
                bgGroup.append('line')
                    .attr('class', 'gateway-line')
                    .attr('x1', start.x)
                    .attr('y1', start.y)
                    .attr('x2', end.x)
                    .attr('y2', end.y)
                    .attr('stroke', colors.gatewayLineColor)
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4,2')
                    .attr('pointer-events', 'none');
            }
        });
    }

    if (gatewayData.plannedGateways && gatewayData.plannedGateways.length > 0) {
        gatewayData.plannedGateways.forEach(gw => {
             const start = getCoords(gw.sourceId);
             const end = getCoords(gw.targetId);

             if (start && end) {
                 bgGroup.append('line')
                    .attr('class', 'planned-gateway-line')
                    .attr('x1', start.x)
                    .attr('y1', start.y)
                    .attr('x2', end.x)
                    .attr('y2', end.y)
                    .attr('stroke', '#f7a600') 
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '6,3')
                    .attr('pointer-events', 'none');

                 const midX = (start.x + end.x) / 2;
                 const midY = (start.y + end.y) / 2;

                 fgGroup.append('text')
                    .attr('class', 'planned-gateway-label')
                    .attr('x', midX)
                    .attr('y', midY)
                    .attr('text-anchor', 'middle') 
                    .attr('dominant-baseline', 'middle') 
                    .attr('fill', '#f7a600') 
                    .attr('stroke', '#000000') 
                    .attr('stroke-width', '3px') 
                    .attr('paint-order', 'stroke')
                    .attr('font-size', '10px')
                    .attr('font-weight', 'bold')
                    .style('pointer-events', 'none')
                    .text(`${gw.distance} pc`);
             }
        });
    }

  }, [mapRef, existingGateways, gatewayData.plannedGateways, mapRenderKey, activeMode]);

  return null;
};

export default GatewayLayer;