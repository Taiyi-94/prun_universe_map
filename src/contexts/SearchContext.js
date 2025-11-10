import React, { createContext, useState, useCallback, useContext } from 'react';
import { GraphContext } from './GraphContext';
import { highlightSearchResults, clearHighlights } from '../utils/searchUtils';


export const SearchContext = createContext();

const sanitizeInput = (input) => {
  // Remove any HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  // Remove special characters except spaces, hyphens, and parentheses
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-()]/g, '');
  // Trim whitespace from the beginning and end
  sanitized = sanitized.trim();
  // Limit the length of the input
  const maxLength = 500;
  sanitized = sanitized.slice(0, maxLength);

  return sanitized;
};

// Helper function to split camelCase into separate words.
const splitCamelCase = (str) => {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
};

export const SearchProvider = ({ children }) => {
  const [searchResults, setSearchResults] = useState([]);
  const { universeData, planetData, materials } = useContext(GraphContext);
  const [searchMaterial, setSearchMaterial] = useState([]);
  const [searchMaterialConcentrationLiquid, setSearchMaterialConcentrationLiquid] = useState([]);
  const [searchMaterialConcentrationGaseous, setSearchMaterialConcentrationGaseous] = useState([]);
  const [searchMaterialConcentrationMineral, setSearchMaterialConcentrationMineral] = useState([]);
  const [filters, setFilters] = useState({
    planetType: ['Rocky', 'Gaseous'],
    gravity: ['Low', 'High'],
    temperature: ['Low', 'High'],
    pressure: ['Low', 'High'],
    cogcProgram: []
  });
  const [systemSearchTerm, setSystemSearchTerm] = useState('');
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [resourceThreshold, setResourceThreshold] = useState(0);
  const [isRelativeThreshold, setIsRelativeThreshold] = useState(false);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('ALL');
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [isCompanySearch, setIsCompanySearch] = useState(false);


  const handleSystemSearch = useCallback((searchTerm) => {
    const sanitizedSearchTerm = sanitizeInput(searchTerm);
    const results = [];
    const terms = sanitizedSearchTerm.split(/\s+/)
      .filter(term => term.length >= 2); // Only keep terms with 1 or more characters

    terms.forEach(term => {
      const lowerTerm = term.toLowerCase();

      // Search in systems
      Object.entries(universeData).forEach(([systemId, systemArray]) => {
        let system = systemArray[0]
        if (system.Name.toLowerCase().includes(term.toLowerCase()) ||
          system.NaturalId.toLowerCase().includes(term.toLowerCase())) {
          results.push({ type: 'system', id: systemId });
        }
      });

      // Search in planets
      Object.entries(planetData).forEach(([systemId, planets]) => {
        planets.forEach(planet => {
          if (planet.PlanetName.toLowerCase().includes(lowerTerm) ||
            planet.PlanetNaturalId.toLowerCase().includes(lowerTerm)) {
            results.push({ type: 'planet', id: planet.PlanetNaturalId, systemId: systemId });
          }
        });
      });
    });

    setSearchResults(results);
    highlightSearchResults(results);
    return results;
  }, [universeData, planetData]);


  const handleMaterialSearch = useCallback((searchTerm) => {
    const sanitizedSearchTerm = sanitizeInput(searchTerm);
    const terms = sanitizedSearchTerm.split(/\s+/)
      .filter(term => term.length >= 1); // Only keep terms with 1 or more characters

    let results = [];
    let matchingMaterialIds = [];

    if (terms.length === 0) {
      // Populate results with all planets if no search terms
      Object.entries(planetData).forEach(([systemId, planets]) => {
        planets.forEach(planet => {
          results.push({
            type: 'planet',
            planetId: planet.PlanetNaturalId,
            systemId: systemId
          });
        });
      });
    } else {
      // Find materials matching the search terms
      const matchingMaterials = terms.map(term => {
        const lowerTerm = term.toLowerCase();
        const regex = new RegExp(`\\b${lowerTerm}\\b`, 'i');
        return materials.filter(material =>
          (regex.test(splitCamelCase(material.Name)) || regex.test(material.Ticker.toLowerCase())) &&
          ['ores', 'gases', 'liquids', 'minerals'].includes(material.CategoryName)
        );
      });

      matchingMaterialIds = matchingMaterials.flat().map(material => material.MaterialId);

      // Find planets that have all specified materials
      Object.entries(planetData).forEach(([systemId, planets]) => {
        planets.forEach(planet => {
          const hasAllMaterials = matchingMaterials.every(materialList =>
            materialList.some(material =>
              planet.Resources.some(resource => resource.MaterialId === material.MaterialId)
            )
          );

          if (hasAllMaterials) {
            const planetResources = matchingMaterials.flatMap(materialList =>
              materialList.filter(material =>
                planet.Resources.some(resource => resource.MaterialId === material.MaterialId)
              )
            );

            planetResources.forEach(material => {
              const resource = planet.Resources.find(r => r.MaterialId === material.MaterialId);
              results.push({
                type: 'material',
                id: material.MaterialId,
                name: material.Name,
                ticker: material.Ticker,
                planetId: planet.PlanetNaturalId,
                systemId: systemId,
                factor: resource.Factor,
                resourceType: resource.ResourceType
              });
            });
          }
        });
      });
    }

    const filteredResults = results.filter(result => {
      const planet = planetData[result.systemId].find(p => p.PlanetNaturalId === result.planetId);

      if (!planet) {
        console.warn(`Planet not found for result:`, result);
        return false;
      }

      if (result.type === 'material') {
        // Apply resource type filter
        if (resourceTypeFilter !== 'ALL' && result.resourceType !== resourceTypeFilter) {
          return false;
        }

        // Apply factor check
        let factorCheck;
        if (isRelativeThreshold) {
          let maxFactor;
          if (resourceTypeFilter === 'ALL') {
            // Use global maximum when 'ALL' is selected
            maxFactor = Math.max(...results
              .filter(r => r.type === 'material')
              .map(r => r.factor));
          } else {
            // Use type-specific maximum when a specific type is selected
            maxFactor = Math.max(...results
              .filter(r => r.type === 'material' && r.resourceType === resourceTypeFilter)
              .map(r => r.factor));
          }
          const relativeFactor = result.factor / maxFactor;
          factorCheck = relativeFactor >= resourceThreshold;
        } else {
          factorCheck = result.factor >= resourceThreshold;
        }

        if (!factorCheck) {
          return false;
        }
      }

      const planetTypeCondition =
        (filters.planetType.includes('Rocky') && planet.Surface) ||
        (filters.planetType.includes('Gaseous') && !planet.Surface);

      const planetFertility =
        (filters.planetType.includes('Fertile') && planet.Fertility > -1) ||
        (!filters.planetType.includes('Fertile'));

      const gravityCondition =
        (filters.gravity.includes('Low') && (planet.Gravity < 0.25)) ||
        (filters.gravity.includes('High') && (planet.Gravity >= 2.5)) ||
        ((0.25 <= planet.Gravity) && (planet.Gravity <= 2.5));

      const temperatureCondition =
        (filters.temperature.includes('Low') && (planet.Temperature < -25.0)) ||
        (filters.temperature.includes('High') && (planet.Temperature >= 75.0)) ||
        ((-25.0 <= planet.Temperature) && (planet.Temperature <= 75.0));

      const pressureCondition =
        (filters.pressure.includes('Low') && (planet.Pressure < 0.25)) ||
        (filters.pressure.includes('High') && (planet.Pressure >= 2.0)) ||
        ((0.25 <= planet.Pressure) && (planet.Pressure <= 2.0));

      const cogcCondition = filters.cogcProgram.length === 0 ||
        (planet.HasChamberOfCommerce && (
          filters.cogcProgram.includes('ALL') ||
          filters.cogcProgram.some(selectedProgram => {
            const programs = planet.COGCPrograms || [];
            const sortedPrograms = programs.sort((a, b) => b.StartEpochMs - a.StartEpochMs);
            const currentProgram = sortedPrograms[1] || sortedPrograms[0] || null;
            if (selectedProgram === null) {
              return !currentProgram || currentProgram.ProgramType === null;
            }

            return currentProgram && currentProgram.ProgramType === selectedProgram;
          })
        ));

      return planetTypeCondition && planetFertility && gravityCondition && temperatureCondition &&
        pressureCondition && cogcCondition;
    });

    // Remove duplicates
    const uniqueResults = Array.from(new Set(filteredResults.map(JSON.stringify))).map(JSON.parse);
    // Obtain the highest concentration
    const highestFactorLiquid = uniqueResults
      .filter(result => result.resourceType === 'LIQUID')
      .reduce((max, item) => item.factor > max ? item.factor : max, -Infinity);
    setSearchMaterialConcentrationLiquid(highestFactorLiquid)
    const highestFactorGaseous = uniqueResults
      .filter(result => result.resourceType === 'GASEOUS')
      .reduce((max, item) => item.factor > max ? item.factor : max, -Infinity);
    setSearchMaterialConcentrationGaseous(highestFactorGaseous)
    const highestFactorMineral = uniqueResults
      .filter(result => result.resourceType === 'MINERAL')
      .reduce((max, item) => item.factor > max ? item.factor : max, -Infinity);
    setSearchMaterialConcentrationMineral(highestFactorMineral)

    setSearchResults(uniqueResults);
    highlightSearchResults(uniqueResults, highestFactorLiquid, highestFactorGaseous, highestFactorMineral);
    setSearchMaterial(matchingMaterialIds);
    return uniqueResults;
  }, [planetData, materials, filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter]);

  const handleCompanySearch = useCallback(async (companyCode) => {
    const sanitizedCompanyCode = sanitizeInput(companyCode);
    try {
      const response = await fetch(`https://rest.fnar.net/company/code/${sanitizedCompanyCode}`);
      const data = await response.json();

      if (data && data.Planets) {
        const results = data.Planets.map(planet => ({
          type: 'company_base',
          planetId: planet.PlanetId,
          planetNaturalId: planet.PlanetNaturalId,
          planetName: planet.PlanetName,
          systemId: Object.keys(planetData).find(systemId =>
            planetData[systemId].some(p => p.PlanetNaturalId === planet.PlanetNaturalId)
          )
        }));

        setSearchResults(results);
        highlightSearchResults(results);
        return results;
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error fetching company data:', error);
      return [];
    }
  }, [planetData]);


  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSystemSearchTerm('');
    setMaterialSearchTerm('');
    setCompanySearchTerm('');
    setSearchMaterial([]);
    setSearchMaterialConcentrationLiquid([]);
    setSearchMaterialConcentrationGaseous([]);
    setSearchMaterialConcentrationMineral([]);
    clearHighlights();
  }, []);

  const updateFilters = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);

  const updateSystemSearchTerm = useCallback((term) => {
    setSystemSearchTerm(term);
  }, []);

  const updateMaterialSearchTerm = useCallback((term) => {
    setMaterialSearchTerm(term);
  }, []);

  const updateCompanySearchTerm = useCallback((term) => {
    setCompanySearchTerm(term);
  }, []);

  const toggleCompanySearch = useCallback(() => {
    setIsCompanySearch(prev => !prev);
    clearSearch();
  }, [clearSearch]);


  return (
    <SearchContext.Provider
      value={{
        searchResults,
        searchMaterial,
        searchMaterialConcentrationLiquid,
        searchMaterialConcentrationMineral,
        searchMaterialConcentrationGaseous,
        handleSystemSearch,
        handleMaterialSearch,
        handleCompanySearch,
        clearSearch,
        filters,
        updateFilters,
        systemSearchTerm,
        materialSearchTerm,
        companySearchTerm,
        updateSystemSearchTerm,
        updateMaterialSearchTerm,
        updateCompanySearchTerm,
        resourceThreshold,
        setResourceThreshold,
        isRelativeThreshold,
        setIsRelativeThreshold,
        resourceTypeFilter,
        setResourceTypeFilter,
        isCompanySearch,
        toggleCompanySearch,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};