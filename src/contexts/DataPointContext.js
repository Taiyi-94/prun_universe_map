import React, { createContext, useState, useContext, useCallback, useMemo, useEffect } from 'react';

// Create the context
export const DataPointContext = createContext();

export const DataPointProvider = ({ children }) => {
  // State for system meteorite density data
  const [meteorDensityData, setMeteorDensityData] = useState({});
  const [luminosityData, setLuminosityData] = useState({});
  const [systemNames, setSystemNames] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Visibility toggle for the overlay
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);

  // Scale setting (absolute vs relative)
  const [useRelativeScale, setUseRelativeScale] = useState(false);

  // Fetch system stars data
  // In src/contexts/DataPointContext.js

  // Fetch system stars data
  useEffect(() => {
    const fetchOverlayData = async () => {
      try {
        setIsLoading(true);

        // if we aren't running at the root of the webserver, we need to look at the appropriate place for these.
        const [staticResponse, freshResponse] = await Promise.all([
          fetch(`${process.env.PUBLIC_URL}/systemstars.json`),         // The old, enriched file with Luminosity/Density
          fetch(`${process.env.PUBLIC_URL}/prun_universe_data.json`) // The file that will be updated weekly with fresh names
        ]);

        if (!staticResponse.ok || !freshResponse.ok) {
          throw new Error('Failed to fetch all necessary system data');
        }

        const staticData = await staticResponse.json();
        const freshData = await freshResponse.json();

        const freshSystemNamesMap = new Map(
            freshData.map(system => [system.SystemId, system.Name])
        );

        const densityMap = {};
        const luminosityMap = {};
        const finalSystemNameMap = {};

        staticData.forEach(system => {
          densityMap[system.SystemId] = system.MeteoroidDensity;
          luminosityMap[system.SystemId] = system.Luminosity;
          
          const freshName = freshSystemNamesMap.get(system.SystemId);
          
          finalSystemNameMap[system.SystemId] = freshName || system.Name;
        });

        setMeteorDensityData(densityMap);
        setLuminosityData(luminosityMap);
        setSystemNames(finalSystemNameMap);
        setError(null);

      } catch (err) {
        console.error('Error fetching and combining overlay data:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOverlayData();
  }, []);

  // Get meteorite density for a specific system
  const getSystemMeteorDensity = useCallback((systemId) => {
    return meteorDensityData[systemId] || 0;
  }, [meteorDensityData]);

  const getSystemLuminosity = useCallback((systemId) => {
    return luminosityData[systemId] || 0;
  }, [luminosityData]);

  // Toggle overlay visibility
  const toggleOverlayVisibility = useCallback(() => {
    setIsOverlayVisible(prev => !prev);
  }, []);

  // Toggle scale type
  const toggleScaleType = useCallback(() => {
    setUseRelativeScale(prev => !prev);
  }, []);

  // Get maximum density and luminosity value for relative scaling
  const maxValues = useMemo(() => ({
    density: Math.max(0, ...Object.values(meteorDensityData)),
    luminosity: Math.max(0, ...Object.values(luminosityData))
  }), [meteorDensityData, luminosityData]);

  // Calculate normalized density based on scale type
  const getNormalizedValue = useCallback((value, type) => {
    if (!useRelativeScale) return value;
    const maxValue = maxValues[type];
    return maxValue === 0 ? 0 : value / maxValue;
  }, [useRelativeScale, maxValues]);

  const contextValue = {
    meteorDensityData,
    luminosityData,
    systemNames,
    isOverlayVisible,
    useRelativeScale,
    isLoading,
    error,
    getSystemMeteorDensity,
    getSystemLuminosity,
    toggleOverlayVisibility,
    toggleScaleType,
    getNormalizedValue,
    maxValues
  };

  return (
<DataPointContext.Provider value={contextValue}>
{children}
</DataPointContext.Provider>
);
};

// Custom hook for using the data point context
export const useDataPoints = () => {
const context = useContext(DataPointContext);
if (!context) {
throw new Error('useDataPoints must be used within a DataPointProvider');
}
return context;
};