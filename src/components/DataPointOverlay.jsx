import React, { useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { useDataPoints } from '../contexts/DataPointContext';

// Add mapRenderKey to props
const DataPointOverlay = ({ mapRef, mapRenderKey }) => {
  const {
    meteorDensityData,
    luminosityData,
    systemNames,
    isOverlayVisible,
    isLoading,
    error,
    maxValues
  } = useDataPoints();

  const renderOverlay = useCallback(() => {
    // Check if mapRef and the SVG group (g) are actually ready
    if (!mapRef?.current?.g || mapRef.current.g.empty()) return;

    const { g } = mapRef.current;
    
    // Clean up existing elements to prevent duplicates
    g.selectAll('.meteor-density-group').remove();
    g.selectAll('.system-name-label').remove();

    if (isLoading || error) return;

    const transform = d3.zoomTransform(g.node());
    const zoomLevel = transform?.k || 1;

    // Scales
    const densityColorScale = d3.scaleSequential()
      .domain([0, maxValues.density])
      .interpolator(d3.interpolatePuBu);

    const luminosityColorScale = d3.scaleSequential()
      .domain([0, maxValues.luminosity])
      .interpolator(d3.interpolateWarm);

    // Loop through system rectangles
    g.selectAll('rect:not(.meteor-density-bar, .luminosity-bar, .data-overlay)').each(function() {
      const node = d3.select(this);
      const systemId = node.attr('id');
      if (!systemId || systemId === 'rect1') return;

      const nodeWidth = parseFloat(node.attr('width'));
      const nodeHeight = parseFloat(node.attr('height'));
      const nodeX = parseFloat(node.attr('x'));
      const nodeY = parseFloat(node.attr('y'));

      // 1. ALWAYS draw System Names (Visible by default)
      g.append('text')
        .attr('class', 'system-name-label data-overlay')
        .attr('x', nodeX + (nodeWidth / 2))
        .attr('y', nodeY + nodeHeight + 2)
        .attr('fill', '#CCCCCC')
        .attr('stroke', '#000000')
        .attr('stroke-width', 0.8 / zoomLevel)
        .attr('paint-order', 'stroke')
        .attr('font-size', '6px')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'hanging')
        .style('pointer-events', 'none')
        .text(systemNames[systemId] || systemId);

      // 2. Draw Data Bars only if the toggle is ON
      if (isOverlayVisible) {
        const density = meteorDensityData[systemId] || 0;
        const luminosity = luminosityData[systemId] || 0;
        const systemGroup = g.append('g').attr('class', 'meteor-density-group');
        const barWidth = Math.max(3, nodeWidth * 0.2 / zoomLevel);
        const maxBarHeight = nodeHeight;
        const barSpacing = barWidth * 0.5;
        const luminosityLogScale = d3.scaleLog().domain([0.01, maxValues.luminosity]).range([0, maxBarHeight]);
        
        const dHeight = maxBarHeight * (density / maxValues.density);
        const dX = nodeX + nodeWidth * 1.2;
        systemGroup.append('rect').attr('class', 'data-overlay').attr('x', dX).attr('y', nodeY).attr('width', barWidth).attr('height', maxBarHeight).attr('fill', '#2a2a2a').attr('opacity', 0.5);
        const dBar = systemGroup.append('rect').attr('class', 'data-overlay').attr('x', dX).attr('y', nodeY + maxBarHeight - dHeight).attr('width', barWidth).attr('height', dHeight).attr('fill', densityColorScale(density)).attr('opacity', 0.8);

        const lHeight = luminosityLogScale(Math.max(0.1, luminosity));
        const lX = dX + barWidth + barSpacing;
        systemGroup.append('rect').attr('class', 'data-overlay').attr('x', lX).attr('y', nodeY).attr('width', barWidth).attr('height', maxBarHeight).attr('fill', '#2a2a2a').attr('opacity', 0.5);
        const lBar = systemGroup.append('rect').attr('class', 'data-overlay').attr('x', lX).attr('y', nodeY + maxBarHeight - lHeight).attr('width', barWidth).attr('height', lHeight).attr('fill', luminosityColorScale(luminosity)).attr('opacity', 0.8);

        const addHover = (bar, label, val) => {
          bar.on('mouseover.data', (e) => {
            e.stopPropagation();
            d3.select(e.currentTarget).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1 / zoomLevel);
            d3.select('body').append('div').attr('class', 'data-overlay-tooltip')
              .style('position', 'absolute').style('left', `${e.pageX + 10}px`).style('top', `${e.pageY - 10}px`)
              .html(`<div style="background:rgba(0,0,0,0.9);padding:8px;border-radius:4px;border:1px solid #444;color:white;font-size:12px;">
                <div style="color:#f7a600;font-weight:bold">${systemNames[systemId] || systemId}</div>
                ${label}: ${val.toFixed(3)}
              </div>`);
          }).on('mouseout.data', (e) => {
            d3.select(e.currentTarget).attr('opacity', 0.8).attr('stroke', 'none');
            d3.selectAll('.data-overlay-tooltip').remove();
          });
        };
        addHover(dBar, 'Density', density);
        addHover(lBar, 'Luminosity', luminosity);
      }
    });
    // Add mapRenderKey to the dependency array
  }, [mapRef, mapRenderKey, isOverlayVisible, isLoading, error, meteorDensityData, luminosityData, systemNames, maxValues]);

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay]);

  useEffect(() => {
    if (!mapRef?.current?.svg) return;
    const svg = mapRef.current.svg;
    svg.on('zoom.overlay', renderOverlay);
    return () => svg.on('zoom.overlay', null);
  }, [mapRef, renderOverlay]);

  return null;
};

export default React.memo(DataPointOverlay);