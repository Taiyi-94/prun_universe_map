import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { useMapMode } from '../contexts/MapModeContext';
import { colors } from '../config/config';

const GatewayLayer = ({ mapRef, mapRenderKey }) => {
  const { existingGateways, activeMode } = useMapMode();

  useEffect(() => {
    if (!mapRef.current || mapRenderKey === 0) return;
    
    const { g } = mapRef.current;
    if (!g || g.empty()) {
        console.error("GatewayLayer: D3 group 'g' not found.");
        return;
    }

    console.log(`GatewayLayer: Attempting to draw ${existingGateways.length} pairs.`);

    // Clear existing layers
    let bgGroup = g.select('.gateway-background-layer');
    if (bgGroup.empty()) {
        bgGroup = g.insert('g', 'rect').attr('class', 'gateway-background-layer');
    }
    bgGroup.selectAll('*').remove();

    const getCoords = (id) => {
        const escapedId = CSS.escape(id);
        const node = g.select(`#${escapedId}`);
        
        if (node.empty()) {
        // THIS IS CRITICAL: If this logs, the ID in gateways.json doesn't match the ID in the SVG
        console.warn(`GatewayLayer: System ID "${id}" not found in SVG DOM.`);
        return null;
        }
        
        return {
        x: parseFloat(node.attr('x')) + parseFloat(node.attr('width')) / 2,
        y: parseFloat(node.attr('y')) + parseFloat(node.attr('height')) / 2
        };
    };

    let drawnCount = 0;
    existingGateways.forEach(pair => {
        const start = getCoords(pair.sourceSysId);
        const end = getCoords(pair.targetSysId);
        
        if (start && end) {
            const lineGroup = bgGroup.append('g')
            .attr('class', 'gateway-link-item');

            // The visible dashed line
            lineGroup.append('line')
            .attr('x1', start.x).attr('y1', start.y)
            .attr('x2', end.x).attr('y2', end.y)
            .attr('stroke', colors.gatewayLineColor)
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,2')
            .style('pointer-events', 'none');

            // The invisible wider interaction line
            lineGroup.append('line')
            .attr('x1', start.x).attr('y1', start.y)
            .attr('x2', end.x).attr('y2', end.y)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 8)
            .style('cursor', 'pointer')
            .on('mouseover', (event) => {
                d3.selectAll('.gateway-detail-tooltip').remove();
                const tooltip = d3.select('body').append('div')
                .attr('class', 'gateway-detail-tooltip')
                .style('left', (event.pageX + 15) + 'px')
                .style('top', (event.pageY - 10) + 'px');

                let content = '<div class="gateway-tooltip-container">';
                pair.links.forEach(link => {
                content += `
                    <div class="gateway-col">
                    <div class="gw-title">${link.Name}</div>
                    <div class="gw-stat ${link.OperationalState === 'OPERATIONAL' ? 'ops' : 'err'}">${link.OperationalState.replace('_', ' ')}</div>
                    <div class="gw-info">Volume: T${link.MaxShipVolume || 1}</div>
                    <div class="gw-info">Cost: ${link.UsageAmount || 0} ${link.UsageCurrency || ''}</div>
                    </div>`;
                });
                content += '</div>';
                tooltip.html(content);
            })
            .on('mouseout', () => {
                d3.selectAll('.gateway-detail-tooltip').remove();
            });
        }
    });
    console.log(`GatewayLayer: Successfully drawn ${drawnCount} out of ${existingGateways.length} lines.`);
  }, [existingGateways, mapRenderKey]);

  return null;
};

export default GatewayLayer;