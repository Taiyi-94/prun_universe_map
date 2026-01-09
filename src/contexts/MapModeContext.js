import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { GraphContext } from './GraphContext';
import { calculate3DDistance, findClosestSystems, findBestMidpoints } from '../utils/distanceUtils';

export const MAP_MODES = {
  STANDARD: 'STANDARD',
  GATEWAY: 'GATEWAY'
};

export const GATEWAY_STRATEGIES = {
  SINGLE: 'SINGLE',
  DUAL: 'DUAL'
};

const MapModeContext = createContext();

export const MapModeProvider = ({ children }) => {
  const { universeData } = useContext(GraphContext); 
  
  const [activeMode, setActiveMode] = useState(MAP_MODES.STANDARD);
  const [existingGateways, setExistingGateways] = useState([]);
  const [hoveredSystemId, setHoveredSystemId] = useState(null);

  const [gatewayData, setGatewayData] = useState({
    originA: null, 
    originB: null,
    strategy: GATEWAY_STRATEGIES.SINGLE,
    plannedGateways: [] 
  });

  const [candidateList, setCandidateList] = useState([]);

  // Fetch Existing Gateways
  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/gateways.json`)
      .then(response => response.json())
      .then(data => setExistingGateways(data))
      .catch(err => console.error("Failed to load existing gateways:", err));
  }, []);

  // Calculation Effect
  useEffect(() => {
    if (activeMode !== MAP_MODES.GATEWAY || !universeData) return;

    if (!gatewayData.originA) {
      setCandidateList([]);
      return;
    }

    if (gatewayData.strategy === GATEWAY_STRATEGIES.SINGLE) {
      const results = findClosestSystems(gatewayData.originA, universeData);
      setCandidateList(results);
    } 
    else if (gatewayData.strategy === GATEWAY_STRATEGIES.DUAL && gatewayData.originB) {
      const results = findBestMidpoints(gatewayData.originA, gatewayData.originB, universeData);
      setCandidateList(results);
    }
  }, [gatewayData.originA, gatewayData.originB, gatewayData.strategy, activeMode, universeData]);


  // Actions
  const toggleMode = useCallback(() => {
    setActiveMode(prev => prev === MAP_MODES.STANDARD ? MAP_MODES.GATEWAY : MAP_MODES.STANDARD);
  }, []);

  const setGatewayStrategy = useCallback((strategy) => {
    setGatewayData(prev => ({ 
      ...prev, 
      strategy,
      originB: strategy === GATEWAY_STRATEGIES.SINGLE ? null : prev.originB 
    }));
  }, []);

  const setOriginById = useCallback((systemId, slot = 'A') => {
    if (!universeData || !universeData[systemId]) return;
    const systemObj = universeData[systemId][0]; 
    setGatewayData(prev => ({
      ...prev,
      [slot === 'A' ? 'originA' : 'originB']: systemObj
    }));
  }, [universeData]);

  // Updated: Check for duplicates before adding
  const addPlannedGateway = useCallback((gateway) => {
    setGatewayData(prev => {
        // Simple check: same source/target IDs (order independent)
        const exists = prev.plannedGateways.some(g => 
            (g.sourceId === gateway.sourceId && g.targetId === gateway.targetId) ||
            (g.sourceId === gateway.targetId && g.targetId === gateway.sourceId)
        );
        
        if (exists) return prev; // Do nothing if exists

        return {
            ...prev,
            plannedGateways: [...prev.plannedGateways, gateway]
        };
    });
  }, []);

  // New: Add Dual Route (A->Mid + Mid->B)
  const addDualRoute = useCallback((originA, originB, midpoint) => {
      const route1 = {
          id: Date.now().toString() + "_1",
          sourceId: originA.SystemId,
          targetId: midpoint.SystemId,
          source: originA.Name,
          target: midpoint.Name,
          distance: calculate3DDistance(originA, midpoint).toFixed(2)
      };
      
      const route2 = {
          id: Date.now().toString() + "_2",
          sourceId: midpoint.SystemId,
          targetId: originB.SystemId,
          source: midpoint.Name,
          target: originB.Name,
          distance: calculate3DDistance(midpoint, originB).toFixed(2)
      };

      // Add both using functional update to ensure state consistency
      setGatewayData(prev => {
          // Filter duplicates for both routes
          const isDup = (g, newG) => (g.sourceId === newG.sourceId && g.targetId === newG.targetId) ||
                                     (g.sourceId === newG.targetId && g.targetId === newG.sourceId);
          
          let nextList = [...prev.plannedGateways];
          if (!nextList.some(g => isDup(g, route1))) nextList.push(route1);
          if (!nextList.some(g => isDup(g, route2))) nextList.push(route2);

          return { ...prev, plannedGateways: nextList };
      });
  }, []);

  const removePlannedGateway = useCallback((gatewayId) => {
    setGatewayData(prev => ({
      ...prev,
      plannedGateways: prev.plannedGateways.filter(g => g.id !== gatewayId)
    }));
  }, []);

  const resetSelection = useCallback(() => {
    setGatewayData(prev => ({
      ...prev,
      originA: null,
      originB: null
    }));
  }, []);

  const clearAllGateways = useCallback(() => {
    setGatewayData(prev => ({
      ...prev,
      originA: null,
      originB: null,
      plannedGateways: [] 
    }));
  }, []);

  return (
    <MapModeContext.Provider value={{
      activeMode,
      toggleMode,
      existingGateways,
      gatewayData,
      candidateList,
      setGatewayData,
      setGatewayStrategy,
      setOriginById,
      addPlannedGateway,
      addDualRoute, 
      removePlannedGateway,
      resetSelection,   
      clearAllGateways, 
      calculate3DDistance,
      hoveredSystemId,
      setHoveredSystemId
    }}>
      {children}
    </MapModeContext.Provider>
  );
};

export const useMapMode = () => useContext(MapModeContext);