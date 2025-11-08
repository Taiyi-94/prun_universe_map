// Example Node component for handling individual node interactions
import { useEffect } from 'react';
import * as d3 from 'd3';

const Node = ({ id, x, y, width, height, fill, stroke }) => {
  useEffect(() => {
    const node = d3.select(`#${id}`);
    const originalSize = { width, height };
    const originalPos = { x, y };

    node.on('mouseover', function () {
      if (id === 'rect1') return;
      node
        .attr('fill-opacity', 1)
        .attr('stroke-opacity', 1)
        .transition()
        .duration(200)
        .attr('width', originalSize.width * 2)
        .attr('height', originalSize.height * 2)
        .attr('x', originalPos.x - originalSize.width / 2)
        .attr('y', originalPos.y - originalSize.height / 2);
    }).on('mouseout', function () {
      if (id === 'rect1') return;
      node.transition()
        .duration(200)
        .attr('width', originalSize.width)
        .attr('height', originalSize.height)
        .attr('x', originalPos.x)
        .attr('y', originalPos.y)
        .attr('fill-opacity', 0.8);
    });

    // Add click event if needed
  }, [id, x, y, width, height]);

  return null; // This component is for logic only
};

export default Node;
