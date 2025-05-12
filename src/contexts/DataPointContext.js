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
  useEffect(() => {
    const fetchMeteorData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('systemstars.json');
        if (!response.ok) {
          throw new Error('Failed to fetch system stars data');
        }
        const data = await response.json();

        // Transform data into maps for density and system names
        const densityMap = {};
        const luminosityMap = {};
        const systemNameMap = {};
        data.forEach(system => {
          densityMap[system.SystemId] = system.MeteoroidDensity;
          luminosityMap[system.SystemId] = system.Luminosity;
          systemNameMap[system.SystemId] = system.Name;
        });

        setMeteorDensityData(densityMap);
        setLuminosityData(luminosityMap);
        setSystemNames(systemNameMap);
        setError(null);
      } catch (err) {
        console.error('Error fetching meteor density data:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMeteorData();
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