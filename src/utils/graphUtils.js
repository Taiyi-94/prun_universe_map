import * as d3 from 'd3';
import { find_path } from 'dijkstrajs';
import { colors } from '../config/config';

export const findShortestPath = (graph, system1, system2, highlightPath) => {
  if (system1 === 'rect1' || system2 === 'rect1') {
    console.error('Invalid system selection for pathfinding:', system1, system2);
    return;
  }

  const graphNodes = {};
  graph.edges.forEach(edge => {
    if (!graphNodes[edge.start]) graphNodes[edge.start] = {};
    if (!graphNodes[edge.end]) graphNodes[edge.end] = {};
    graphNodes[edge.start][edge.end] = edge.distance;
    graphNodes[edge.end][edge.start] = edge.distance;
  });

  try {
    const path = find_path(graphNodes, system1, system2);
    console.log('Found Path:', path)
    highlightPath(path, system2);
  } catch (error) {
    console.error('Error finding path:', error);
  }
};

// Function to reset all nodes and paths
export const resetGraphState = (nextSelectedSystem) => {
  // Reset all system nodes color and stroke except the background rect and current selection
  d3.selectAll('rect').each(function() {
    const systemId = d3.select(this).attr('id');
    if (systemId !== 'rect1' && systemId !== nextSelectedSystem) {
      d3.select(this)
        .attr('fill', colors.resetSystemFill)
        .attr('fill-opacity', colors.resetSystemFillOpacity)
        .attr('stroke', colors.resetSystemStroke)
        .attr('stroke-width', colors.resetSystemStrokeWidth);
    }
  });

  // Reset all paths color and stroke
  d3.selectAll('path').each(function() {
    d3.select(this)
      .attr('stroke', colors.resetPathStroke)
      .attr('stroke-width', colors.resetPathStrokeWidth);
  });
};

// Function to highlight the path
export const highlightPath = (path, systemSelected) => {
  // Reset all system nodes color and stroke except the background rect
  resetGraphState(systemSelected)

  // Highlight systems in the path
  path.forEach(system => {
    d3.select(`#${CSS.escape(system)}`)
      .attr('fill', colors.systemFill)
      .attr('stroke', colors.systemStroke);
  });

  // Highlight paths in the path
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];

    d3.selectAll(`path[id*="${start}"][id*="${end}"], path[id*="${end}"][id*="${start}"]`)
      .attr('stroke', colors.pathStroke)
      .attr('stroke-width', colors.pathStrokeWidth);
  }

  // Ensure the start and end systems of the path are highlighted
  if (path.length >= 2) {
    const startSystem = path[0];
    const endSystem = path[path.length - 1];
    highlightSelectedSystem(null, startSystem, [startSystem, endSystem]);
    highlightSelectedSystem(null, endSystem, [startSystem, endSystem]);
  }
};

export const highlightSelectedSystem = (prevSelectedSystem, nextSelectedSystem, pathfindingSelection, isPathfindingEnabled) => {

  // Check if pathfindingSelection is empty, if so reset all nodes
  if (pathfindingSelection.length < 2 && isPathfindingEnabled) {
    resetGraphState(nextSelectedSystem);
  }

  // Reset previous system if it's not part of pathfinding selection
  if (prevSelectedSystem && !pathfindingSelection.includes(prevSelectedSystem)) {
    const prevSystemNode = d3.select(`#${CSS.escape(prevSelectedSystem)}`);
    if (!prevSystemNode.empty()) {
      prevSystemNode
        .attr('fill', colors.resetSystemFill)
        .attr('fill-opacity', colors.resetSystemFillOpacity)
        .attr('stroke', colors.resetSystemStroke)
        .attr('stroke-width', colors.resetSystemStrokeWidth);
    }
  }

  // Highlight new system
  if (nextSelectedSystem) {
    const nextSystemNode = d3.select(`#${CSS.escape(nextSelectedSystem)}`);
    if (!nextSystemNode.empty()) {
      nextSystemNode
        .attr('fill', colors.systemFill)
        .attr('stroke', colors.systemStroke)
        .attr('stroke-width', colors.systemStrokeWidth);
    }
  }
};