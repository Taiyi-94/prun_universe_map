import { useState, useEffect } from 'react';
import { useFetchGraphData } from './useFetchGraphData';

const useGraphState = () => {
  const [graph, setGraph] = useState({ nodes: {}, edges: [] });
  const fetched = useFetchGraphData();

  useEffect(() => {
    if (fetched) setGraph(fetched);
  }, [fetched]);

  return {
    graph,
    setGraph,
  };
};

export default useGraphState;
