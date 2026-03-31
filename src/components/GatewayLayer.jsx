import React, { useEffect } from 'react';
import * as d3 from 'd3';
import { useMapMode } from '../contexts/MapModeContext';
import { colors } from '../config/config';

const GatewayLayer = ({ mapRef, mapRenderKey }) => {
  const { existingGateways } = useMapMode();

  useEffect(() => {
    if (!mapRef.current || mapRenderKey === 0 || existingGateways.length === 0) return;
    const { g } = mapRef.current;

    // Use a top-level group to ensure visibility
    let gwGroup = g.select('.gateway-layer');
    if (gwGroup.empty()) {
      gwGroup = g.append('g').attr('class', 'gateway-layer');
    }
    gwGroup.selectAll('*').remove();

    existingGateways.forEach(pair => {
      const startNode = g.select(`#${CSS.escape(pair.sourceSysId)}`);
      const endNode = g.select(`#${CSS.escape(pair.targetSysId)}`);
      
      if (!startNode.empty() && !endNode.empty()) {
        const x1 = parseFloat(startNode.attr('x')) + parseFloat(startNode.attr('width')) / 2;
        const y1 = parseFloat(startNode.attr('y')) + parseFloat(startNode.attr('height')) / 2;
        const x2 = parseFloat(endNode.attr('x')) + parseFloat(endNode.attr('width')) / 2;
        const y2 = parseFloat(endNode.attr('y')) + parseFloat(endNode.attr('height')) / 2;

        const linkItem = gwGroup.append('g');

        // Visible dashed line
        linkItem.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
          .attr('stroke', colors.gatewayLineColor)
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,3')
          .style('pointer-events', 'none');

        // Wider invisible line for interaction
        linkItem.append('line')
          .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
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
              html += `
                <div class="gateway-col">
                  <div class="gw-title">${l.Name}</div>
                  <div class="gw-stat" style="color:${isOps ? '#66ff66' : '#ff6666'}">
                    ${l.OperationalState.replace(/_/g, ' ')}
                  </div>
                  <div class="gw-info">Volume: T${l.MaxShipVolume || 1}</div>
                  <div class="gw-info">Cost: ${l.UsageAmount || 0} ${l.UsageCurrency || ''}</div>
                </div>`;
            });
            html += '</div>';
            tooltip.html(html);
          })
          .on('mouseout', () => d3.selectAll('.gateway-detail-tooltip').remove());
      }
    });
  }, [existingGateways, mapRenderKey, mapRef]);

  return null;
};

export default GatewayLayer;