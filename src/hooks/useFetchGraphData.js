import { useState, useEffect } from 'react';

export const useFetchGraphData = () => {
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    console.log('useFetchGraphData hook executed');
    fetch(`${process.env.PUBLIC_URL}/graph_data.json`)
      .then(response => response.json())
      .then(data => {
        console.log('Fetched Graph Data:', data);
        setGraphData(data);
      })
      .catch(error => {
        console.error('Error fetching graph data:', error);
      });
  }, []);

  return graphData;
};