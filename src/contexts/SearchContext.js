import React, { createContext, useState, useCallback, useContext, useMemo } from 'react';
import { GraphContext } from './GraphContext';
import { phaseMultiplier } from '../constants/phaseMultiplier';
import { highlightSearchResults, clearHighlights } from '../utils/searchUtils';
import { determinePlanetTier } from '../utils/svgUtils'; // Import logic to calculate environmental star penalties


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
  // EXCESSIVE COMMENTING: Extended the native filters object to include `minStars` defaulting to 0 so all planets show by default.
  const [filters, setFilters] = useState({
    planetType: ['Rocky', 'Gaseous'],
    gravity: ['Low', 'High'],
    temperature: ['Low', 'High'],
    pressure: ['Low', 'High'],
    cogcProgram: [],
    minStars: 0
  });
  const [systemSearchTerm, setSystemSearchTerm] = useState('');
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [resourceThreshold, setResourceThreshold] = useState(0);
  const [isRelativeThreshold, setIsRelativeThreshold] = useState(false);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('ALL');
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [isCompanySearch, setIsCompanySearch] = useState(false);

  // Phase-weighted maximum factor per material across the whole universe,
  // used to normalize relative concentration thresholds.
  const maxFactorPerMaterial = useMemo(() => {
    const maxPerResource = {};
    if (planetData) {
      for (const planet of Object.values(planetData).flat())
        for (const resource of planet.Resources) {
          const factor = resource.Factor * phaseMultiplier[resource.ResourceType];
          if (!maxPerResource[resource.MaterialId] || factor > maxPerResource[resource.MaterialId])
            maxPerResource[resource.MaterialId] = factor;
        }
    }
    return maxPerResource;
  }, [planetData]);


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

    console.log('Results', results);
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
          if (resourceTypeFilter === 'ALL') {
            // Use global maximum when 'ALL' is selected
            const maxFactor = Math.max(...results
              .filter(r => r.type === 'material')
              .map(r => r.factor * phaseMultiplier[r.resourceType]));
            const relativeFactor = result.factor * phaseMultiplier[result.resourceType] / maxFactor;
            factorCheck = relativeFactor >= resourceThreshold;
          } else {
            // Use type-specific maximum when a specific type is selected
            const maxFactor = Math.max(...results
              .filter(r => r.type === 'material' && r.resourceType === resourceTypeFilter)
              .map(r => r.factor));
            const relativeFactor = result.factor / maxFactor;
            factorCheck = relativeFactor >= resourceThreshold;
          }
        } else {
          factorCheck = result.factor >= resourceThreshold;
        }

        if (!factorCheck) {
          return false;
        }
      } else if (resourceThreshold > 0) {
        let factorCheck;
        if (isRelativeThreshold) {
          factorCheck = planet.Resources.some(resource => {
            const factor = resource.Factor * phaseMultiplier[resource.ResourceType];
            return factor / maxFactorPerMaterial[resource.MaterialId] >= resourceThreshold;
          });
        } else {
          factorCheck = planet.Resources.some(resource =>
            resource.Factor >= resourceThreshold);
        }
        if (!factorCheck)
          return false;
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

      // EXCESSIVE COMMENTING: We calculate the stars based on the exact same metric as the map tooltip visual layer, ensuring 1:1 behavioral alignment.
      const tierCondition = determinePlanetTier(planet.BuildRequirements) >= (filters.minStars || 0);

      return planetTypeCondition && planetFertility && gravityCondition && temperatureCondition &&
             pressureCondition && cogcCondition && tierCondition;
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

    console.log('Results', uniqueResults);
    setSearchResults(uniqueResults);
    highlightSearchResults(uniqueResults, highestFactorLiquid, highestFactorGaseous, highestFactorMineral);
    setSearchMaterial(matchingMaterialIds);
    return uniqueResults;
  }, [planetData, materials, filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter, maxFactorPerMaterial]);

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

  const generateSuggestions = useCallback((term) => {
    if (!term || term.trim().length === 0) return [];
    const lowerTerm = term.toLowerCase().trim();
    const suggestions = [];

    // Scan materials
    if (materials) {
        materials.forEach(m => {
            if (m.Ticker.toLowerCase().includes(lowerTerm) || m.Name.toLowerCase().includes(lowerTerm)) {
                suggestions.push({ text: m.Ticker, label: m.Name, category: 'Resource' });
            }
        });
    }
    
    // Scan systems
    if (universeData) {
        Object.values(universeData).forEach(sysArr => {
            const sys = sysArr[0];
            if (sys.Name.toLowerCase().includes(lowerTerm) || sys.NaturalId.toLowerCase().includes(lowerTerm)) {
                suggestions.push({ text: sys.NaturalId, label: sys.Name, category: 'System' });
            }
        });
    }
    
    // Scan planets
    if (planetData) {
        Object.values(planetData).forEach(planets => {
            planets.forEach(p => {
                if (p.PlanetName.toLowerCase().includes(lowerTerm) || p.PlanetNaturalId.toLowerCase().includes(lowerTerm)) {
                    suggestions.push({ text: p.PlanetNaturalId, label: p.PlanetName, category: 'Planet' });
                }
            });
        });
    }

    // Add a synthetic corporation search option inherently without spamming the remote FIO endpoint.
    suggestions.push({ text: term.toUpperCase(), label: 'Search FIO Database', category: 'Corporation' });

    // Enforce Exact-Match precedence weighting in the dropdown logic
    suggestions.sort((a, b) => {
        const aExact = a.text.toLowerCase() === lowerTerm;
        const bExact = b.text.toLowerCase() === lowerTerm;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return a.text.length - b.text.length;
    });

    // Strip duplicates and limit to a flat 15 index limit to maintain high FPS performance
    const unique = [];
    const seen = new Set();
    for (const s of suggestions) {
        const key = `${s.text}-${s.category}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(s);
        }
        if (unique.length >= 15) break;
    }

    return unique;
  }, [materials, universeData, planetData]);

  const executeUnifiedSearch = useCallback(async (option) => {
    clearSearch(); 
    let results = [];

    if (option.category === 'Corporation') {
        setIsCompanySearch(true);
        setCompanySearchTerm(option.text);
        results = await handleCompanySearch(option.text);
    } else if (option.category === 'Resource') {
        setIsCompanySearch(false);
        setMaterialSearchTerm(option.text);
        results = handleMaterialSearch(option.text);
    } else if (option.category === 'System' || option.category === 'Planet' || option.category === 'General') {
        setIsCompanySearch(false);
        setSystemSearchTerm(option.text);
        results = handleSystemSearch(option.text);
    }
    return results;
  }, [clearSearch, handleCompanySearch, handleMaterialSearch, handleSystemSearch]);


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
        generateSuggestions, 
        executeUnifiedSearch 
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};