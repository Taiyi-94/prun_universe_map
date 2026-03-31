import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { useMapMode } from '../contexts/MapModeContext';
import { colors } from '../config/config';

const GatewayLayer = ({ mapRef, mapRenderKey }) => {
    const { existingGateways, gatewayData } = useMapMode();

    useEffect(() => {
        if (!mapRef.current || mapRenderKey === 0) return;
        const { g } = mapRef.current;

        const getCoords = (systemId) => {
            if (!systemId) return null;
            const node = g.select(`#${CSS.escape(systemId.toLowerCase())}`);
            if (node.empty()) return null;
            return {
                x: parseFloat(node.attr('x')) + parseFloat(node.attr('width')) / 2,
                y: parseFloat(node.attr('y')) + parseFloat(node.attr('height')) / 2
            };
        };

        // 1. Locate or create the Gateway Layer
        let gwGroup = g.select('.gateway-layer');
        
        if (gwGroup.empty()) {
            gwGroup = g.append('g').attr('class', 'gateway-layer');
        } else {
            gwGroup.raise();
        }
        
        gwGroup.selectAll('*').remove();

        // 2. Render Existing Gateways (API Data)
        existingGateways.forEach(pair => {
            const start = getCoords(pair.sourceSysId);
            const end = getCoords(pair.targetSysId);
            
            if (start && end) {
                const linkItem = gwGroup.append('g');

                // Visible dashed line
                linkItem.append('line')
                    .attr('x1', start.x).attr('y1', start.y)
                    .attr('x2', end.x).attr('y2', end.y)
                    .attr('stroke', colors.gatewayLineColor)
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '4,3')
                    .style('pointer-events', 'none');

                // Interaction line
                linkItem.append('line')
                    .attr('x1', start.x).attr('y1', start.y)
                    .attr('x2', end.x).attr('y2', end.y)
                    .attr('stroke', 'transparent')
                    .attr('stroke-width', 12)
                    .style('cursor', 'pointer')
                    .on('mouseover', (event) => {
                        d3.selectAll('.gateway-detail-tooltip').remove();
                        const tooltip = d3.select('body').append('div')
                            .attr('class', 'gateway-detail-tooltip')
                            .style('left', (event.pageX + 15) + 'px')
                            .style('top', (event.pageY - 10) + 'px');

                        let html = '<div class="gateway-tooltip-container">';
                        pair.links.forEach(l => {
                            const isOps = l.OperationalState === 'OPERATIONAL';
                            const currentJumps = l.CurrentPhaseJumps || 0;
                            const maxJumps = l.JumpsPerDay || 0;
                            html += `
                            <div class="gateway-col">
                                <div class="gw-title">${l.Name}</div>
                                <div class="gw-stat" style="color:${isOps ? '#66ff66' : '#ff6666'}">
                                ${l.OperationalState.replace(/_/g, ' ')}
                                </div>
                                <div class="gw-info">Volume: T${l.MaxShipVolume || 1}</div>
                                <div class="gw-info">Cost: ${l.UsageAmount || 0} ${l.UsageCurrency || ''}</div>
                                <div class="gw-info">Jumps (24h): ${currentJumps} / ${maxJumps}</div>
                            </div>`;
                        });
                        html += '</div>';
                        tooltip.html(html);
                    })
                    .on('mouseout', () => d3.selectAll('.gateway-detail-tooltip').remove());
            }
        });

        // 3. Render Planned Gateways (Golden Dashed Lines)
        if (gatewayData.plannedGateways && gatewayData.plannedGateways.length > 0) {
            gatewayData.plannedGateways.forEach(gw => {
                const start = getCoords(gw.sourceId);
                const end = getCoords(gw.targetId);

                if (start && end) {
                    const plannedItem = gwGroup.append('g').attr('class', 'planned-gateway-item-layer');

                    // Golden Dashed Line
                    plannedItem.append('line')
                        .attr('x1', start.x).attr('y1', start.y)
                        .attr('x2', end.x).attr('y2', end.y)
                        .attr('stroke', '#f7a600') 
                        .attr('stroke-width', 2.5)
                        .attr('stroke-dasharray', '6,3')
                        .style('pointer-events', 'none');

                    // Distance Label
                    const midX = (start.x + end.x) / 2;
                    const midY = (start.y + end.y) / 2;

                    plannedItem.append('text')
                        .attr('x', midX).attr('y', midY)
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'middle')
                        .attr('fill', '#f7a600')
                        .attr('stroke', '#000')
                        .attr('stroke-width', '3px')
                        .attr('paint-order', 'stroke')
                        .attr('font-size', '10px')
                        .attr('font-weight', 'bold')
                        .style('pointer-events', 'none')
                        .text(`${gw.distance} pc`);
                }
            });
        }

    }, [existingGateways, gatewayData.plannedGateways, mapRenderKey, mapRef]);

    return null;
};

export default GatewayLayer;