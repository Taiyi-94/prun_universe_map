import React, { createContext, useState, useCallback, useContext, useMemo, useEffect, useRef } from 'react';
import { GraphContext } from './GraphContext';
import { phaseMultiplier } from '../constants/phaseMultiplier';
import { highlightSearchResults, clearHighlights } from '../utils/searchUtils';
import { determinePlanetTier } from '../utils/svgUtils'; 

export const SearchContext = createContext();

const sanitizeInput = (input) => {
  let sanitized = input.replace(/<[^>]*>/g, '');
  sanitized = sanitized.replace(/[^a-zA-Z0-9\s\-()]/g, '');
  sanitized = sanitized.trim();
  const maxLength = 500;
  sanitized = sanitized.slice(0, maxLength);
  return sanitized;
};

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
    cogcProgram: [],
    minStars: 0
  });
  
  const [unifiedSearchTerm, setUnifiedSearchTerm] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const lastQueryRef = useRef({ text: '', category: 'General' });

  const [systemSearchTerm, setSystemSearchTerm] = useState('');
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [resourceThreshold, setResourceThreshold] = useState(0);
  const [isRelativeThreshold, setIsRelativeThreshold] = useState(false);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('ALL');
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [isCompanySearch, setIsCompanySearch] = useState(false);

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

  const applyFiltersToResults = useCallback((resultsToFilter) => {
    const filtered = resultsToFilter.filter(result => {
      if (result.type === 'company_base') return true;

      const targetPlanetId = result.planetId || (result.type === 'planet' ? result.id : null);
      if (!targetPlanetId && result.type === 'system') return true; 

      const planet = planetData[result.systemId]?.find(p => p.PlanetNaturalId === targetPlanetId);
      if (!planet) return false;

      if (result.type === 'material') {
        if (resourceTypeFilter !== 'ALL' && result.resourceType !== resourceTypeFilter) {
          return false;
        }
        let factorCheck;
        if (isRelativeThreshold) {
          if (resourceTypeFilter === 'ALL') {
            const maxFactor = Math.max(...resultsToFilter
              .filter(r => r.type === 'material')
              .map(r => r.factor * phaseMultiplier[r.resourceType]));
            const relativeFactor = result.factor * phaseMultiplier[result.resourceType] / maxFactor;
            factorCheck = relativeFactor >= resourceThreshold;
          } else {
            const maxFactor = Math.max(...resultsToFilter
              .filter(r => r.type === 'material' && r.resourceType === resourceTypeFilter)
              .map(r => r.factor));
            const relativeFactor = result.factor / maxFactor;
            factorCheck = relativeFactor >= resourceThreshold;
          }
        } else {
          factorCheck = result.factor >= resourceThreshold;
        }
        if (!factorCheck) return false;

      } else if (resourceThreshold > 0) {
        let factorCheck;
        if (isRelativeThreshold) {
          factorCheck = planet.Resources.some(resource => {
            const factor = resource.Factor * phaseMultiplier[resource.ResourceType];
            return factor / maxFactorPerMaterial[resource.MaterialId] >= resourceThreshold;
          });
        } else {
          factorCheck = planet.Resources.some(resource => resource.Factor >= resourceThreshold);
        }
        if (!factorCheck) return false;
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

      const tierCondition = determinePlanetTier(planet.BuildRequirements) >= (filters.minStars || 0);

      return planetTypeCondition && planetFertility && gravityCondition && temperatureCondition &&
             pressureCondition && cogcCondition && tierCondition;
    });

    return Array.from(new Set(filtered.map(JSON.stringify))).map(JSON.parse);
  }, [planetData, filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter, maxFactorPerMaterial]);


  const finalizeAndHighlight = useCallback((uniqueResults, matchingMaterialIds = []) => {
    const highestFactorLiquid = uniqueResults
      .filter(r => r.resourceType === 'LIQUID')
      .reduce((max, item) => item.factor > max ? item.factor : max, -Infinity);
    setSearchMaterialConcentrationLiquid(highestFactorLiquid);
    
    const highestFactorGaseous = uniqueResults
      .filter(r => r.resourceType === 'GASEOUS')
      .reduce((max, item) => item.factor > max ? item.factor : max, -Infinity);
    setSearchMaterialConcentrationGaseous(highestFactorGaseous);
    
    const highestFactorMineral = uniqueResults
      .filter(r => r.resourceType === 'MINERAL')
      .reduce((max, item) => item.factor > max ? item.factor : max, -Infinity);
    setSearchMaterialConcentrationMineral(highestFactorMineral);

    setSearchResults(uniqueResults);
    highlightSearchResults(uniqueResults, highestFactorLiquid, highestFactorGaseous, highestFactorMineral);
    setSearchMaterial(matchingMaterialIds);
    return uniqueResults;
  }, []);

  const handleSystemSearch = useCallback((searchTerm) => {
    const sanitizedSearchTerm = sanitizeInput(searchTerm);
    const results = [];
    const terms = sanitizedSearchTerm.split(/\s+/).filter(term => term.length >= 1); 

    if (terms.length === 0) {
      Object.entries(planetData).forEach(([systemId, planets]) => {
        planets.forEach(planet => {
          results.push({ type: 'planet', id: planet.PlanetNaturalId, systemId: systemId });
        });
      });
    } else {
      terms.forEach(term => {
        const lowerTerm = term.toLowerCase();

        Object.entries(universeData).forEach(([systemId, systemArray]) => {
        let system = systemArray[0]
          if (system.Name.toLowerCase().includes(lowerTerm) ||
              system.NaturalId.toLowerCase().includes(lowerTerm)) {
            results.push({ type: 'system', id: systemId });
          }
        });

        Object.entries(planetData).forEach(([systemId, planets]) => {
          planets.forEach(planet => {
            if (planet.PlanetName.toLowerCase().includes(lowerTerm) ||
                planet.PlanetNaturalId.toLowerCase().includes(lowerTerm)) {
              results.push({ type: 'planet', id: planet.PlanetNaturalId, systemId: systemId });
            }
          });
        });
      });
    }

    const uniqueResults = applyFiltersToResults(results);
    return finalizeAndHighlight(uniqueResults);
  }, [universeData, planetData, applyFiltersToResults, finalizeAndHighlight]);


  const handleMaterialSearch = useCallback((searchTerm) => {
    const sanitizedSearchTerm = sanitizeInput(searchTerm);
    const terms = sanitizedSearchTerm.split(/\s+/).filter(term => term.length >= 1); 

    let results = [];
    let matchingMaterialIds = [];

    if (terms.length === 0) {
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
      const matchingMaterials = terms.map(term => {
        const lowerTerm = term.toLowerCase();
        const regex = new RegExp(`\\b${lowerTerm}\\b`, 'i');
        return materials.filter(material =>
          (regex.test(splitCamelCase(material.Name)) || regex.test(material.Ticker.toLowerCase())) &&
          ['ores', 'gases', 'liquids', 'minerals'].includes(material.CategoryName)
        );
      });

      matchingMaterialIds = matchingMaterials.flat().map(material => material.MaterialId);

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

    const uniqueResults = applyFiltersToResults(results);
    return finalizeAndHighlight(uniqueResults, matchingMaterialIds);
  }, [planetData, materials, applyFiltersToResults, finalizeAndHighlight]);


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


  const generateSuggestions = useCallback(async (term) => {
    if (!term || term.trim().length === 0) return [];
    const lowerTerm = term.toLowerCase().trim();
    const suggestions = [];

    if (materials) {
        materials.forEach(m => {
            if (m.Ticker.toLowerCase().includes(lowerTerm) || m.Name.toLowerCase().includes(lowerTerm)) {
                suggestions.push({ text: m.Ticker, label: m.Name, category: 'Resource' });
            }
        });
    }
    
    if (universeData) {
        Object.values(universeData).forEach(sysArr => {
            const sys = sysArr[0];
            if (sys.Name.toLowerCase().includes(lowerTerm) || sys.NaturalId.toLowerCase().includes(lowerTerm)) {
                suggestions.push({ text: sys.NaturalId, label: sys.Name, category: 'System' });
            }
        });
    }
    
    if (planetData) {
        Object.values(planetData).forEach(planets => {
            planets.forEach(p => {
                if (p.PlanetName.toLowerCase().includes(lowerTerm) || p.PlanetNaturalId.toLowerCase().includes(lowerTerm)) {
                    suggestions.push({ text: p.PlanetNaturalId, label: p.PlanetName, category: 'Planet' });
                }
            });
        });
    }

    const sanitizedForFio = sanitizeInput(term);
    if (sanitizedForFio.length > 0 && sanitizedForFio.length <= 8) {
        try {
            const response = await fetch(`https://rest.fnar.net/company/code/${sanitizedForFio}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.Planets && data.Planets.length > 0) {
                    suggestions.push({ 
                      text: data.Code || sanitizedForFio.toUpperCase(), 
                      label: data.Name || 'FIO Corporation', 
                      category: 'Corporation' 
                    });
                }
            }
        } catch (error) {}
    }

    // EXCESSIVE COMMENTING: Advanced dropdown sorting protocol.
    suggestions.sort((a, b) => {
        const aIsCorp = a.category === 'Corporation';
        const bIsCorp = b.category === 'Corporation';

        // Rule 1: Corporations unconditionally drop to the absolute bottom of the dropdown list.
        if (!aIsCorp && bIsCorp) return -1;
        if (aIsCorp && !bIsCorp) return 1;

        // Rule 2: Exact string matches heavily outweigh partial string matches.
        const aExact = a.text.toLowerCase() === lowerTerm;
        const bExact = b.text.toLowerCase() === lowerTerm;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Rule 3: For identical match-types, prefer shorter strings (cleaner matches).
        return a.text.length - b.text.length;
    });

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
    lastQueryRef.current = option;
    clearHighlights();
    
    let results = [];
    if (option.category === 'Corporation') {
        setIsCompanySearch(true);
        setCompanySearchTerm(option.text);
        results = await handleCompanySearch(option.text);
    } else if (option.category === 'Resource') {
        setIsCompanySearch(false);
        setMaterialSearchTerm(option.text);
        results = handleMaterialSearch(option.text);
    } else {
        setIsCompanySearch(false);
        setSystemSearchTerm(option.text);
        results = handleSystemSearch(option.text);
    }
    return results;
  }, [handleCompanySearch, handleMaterialSearch, handleSystemSearch]);


  const clearSearch = useCallback(() => {
    setUnifiedSearchTerm('');
    setSystemSearchTerm('');
    setMaterialSearchTerm('');
    setCompanySearchTerm('');
    setSearchMaterial([]);
    setSearchMaterialConcentrationLiquid([]);
    setSearchMaterialConcentrationGaseous([]);
    setSearchMaterialConcentrationMineral([]);
    
    executeUnifiedSearch({ text: '', category: 'General' });
  }, [executeUnifiedSearch]);

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


  useEffect(() => {
    if (planetData && Object.keys(planetData).length > 0) {
      const timer = setTimeout(() => {
         executeUnifiedSearch(lastQueryRef.current);
      }, 100); 
      return () => clearTimeout(timer);
    }
  }, [filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter, executeUnifiedSearch, planetData]);


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
        unifiedSearchTerm,          
        setUnifiedSearchTerm,
        showAdvanced,                
        setShowAdvanced,
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