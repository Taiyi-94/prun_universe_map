import { useState, useEffect } from 'react';

export const useFetchGraphData = () => {
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    fetch('graph_data.json')
      .then(response => response.json())
      .then(data => {
        setGraphData(data);
      })
      .catch(error => {
        console.error('Error fetching graph data:', error);
      });
  }, []);

  return graphData;
};