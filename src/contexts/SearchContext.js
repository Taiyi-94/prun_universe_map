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
    minStars: 0,
    requireAvailablePlots: false
  });
  
  const [plotsData, setPlotsData] = useState({});
  const [unifiedSearchTerm, setUnifiedSearchTerm] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const lastQueryRef = useRef({ text: '', category: 'General' });
  // EXCESSIVE COMMENTING: Caches full FIO company payloads (keyed by upper-cased code) so the autocomplete fetch and the executed company search never hit the network twice for the same corporation.
  const fioCompanyCacheRef = useRef(new Map());

  const [resourceThreshold, setResourceThreshold] = useState(0);
  const [isRelativeThreshold, setIsRelativeThreshold] = useState(false);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('ALL');
  const [isCompanySearch, setIsCompanySearch] = useState(false);

  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/plots_data.json`)
      .then(response => {
        if (!response.ok) throw new Error("plots_data.json cache missing");
        return response.json();
      })
      .then(data => setPlotsData(data))
      .catch(error => console.log('Availability metrics inactive: ', error.message));
  }, []);

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

  // EXCESSIVE COMMENTING: Scan every planet's Resources once to build the set of MaterialIds that can actually be extracted somewhere in the universe. Recomputed only when planetData changes, so freshly-added resources appear in autocomplete automatically.
  const findableMaterialIds = useMemo(() => {
    const ids = new Set();
    if (planetData) {
      Object.values(planetData).forEach(planets => {
        planets.forEach(planet => {
          (planet.Resources || []).forEach(resource => ids.add(resource.MaterialId));
        });
      });
    }
    return ids;
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

      const plotsCondition = !filters.requireAvailablePlots || 
                             (plotsData[planet.PlanetNaturalId] !== undefined && plotsData[planet.PlanetNaturalId] > 0);

      return planetTypeCondition && planetFertility && gravityCondition && temperatureCondition &&
             pressureCondition && cogcCondition && tierCondition && plotsCondition;
    });

    return Array.from(new Set(filtered.map(JSON.stringify))).map(JSON.parse);
  }, [planetData, filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter, maxFactorPerMaterial, plotsData]);


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
                resourceType: resource.ResourceType,
                // EXCESSIVE COMMENTING: Calculates the star tier natively during search execution, attaching it to the payload so D3 can render it visually on the map layer seamlessly without re-querying datasets.
                planetTier: determinePlanetTier(planet.BuildRequirements)
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
    const cacheKey = sanitizedCompanyCode.toUpperCase();
    try {
      // EXCESSIVE COMMENTING: Reuse the payload the autocomplete already fetched, if available. Only hit the network on a cache miss (e.g. the user typed a full code and submitted before the 1s autocomplete fired).
      let data = fioCompanyCacheRef.current.get(cacheKey);
      if (!data) {
        const response = await fetch(`https://rest.fnar.net/company/code/${sanitizedCompanyCode}`);
        data = await response.json();
        if (data && data.Planets) {
          fioCompanyCacheRef.current.set(cacheKey, data);
        }
      }

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


  // EXCESSIVE COMMENTING: Synchronous local-data autocomplete. Scans materials/systems/planets only — no network. This is the fast path that stays on the existing short debounce in the UI, since it never touches the FIO API.
  const generateLocalSuggestions = useCallback((term) => {
    if (!term || term.trim().length === 0) return [];
    const lowerTerm = term.toLowerCase().trim();
    const suggestions = [];

    if (materials) {
        materials.forEach(m => {
            // EXCESSIVE COMMENTING: Only suggest resources that actually occur on at least one planet — skip materials that exist in the data file but can't be extracted anywhere.
            if (!findableMaterialIds.has(m.MaterialId)) return;
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

    // EXCESSIVE COMMENTING: Rank by WHERE the term matched. `text` is the code/ticker/natural-id, `label` is the human name. Lower tier = better. This makes a genuine ticker hit outrank a coincidental name hit, with exact > starts-with > contains within each.
    const matchTier = (item) => {
        const text = item.text.toLowerCase();
        const label = (item.label || '').toLowerCase();
        if (text === lowerTerm) return 0;          // exact ticker / code
        if (label === lowerTerm) return 1;         // exact name
        if (text.startsWith(lowerTerm)) return 2;  // ticker starts with
        if (label.startsWith(lowerTerm)) return 3; // name starts with
        if (text.includes(lowerTerm)) return 4;    // ticker contains
        return 5;                                  // name contains
    };

    suggestions.sort((a, b) => {
        const tierDiff = matchTier(a) - matchTier(b);
        if (tierDiff !== 0) return tierDiff;

        return a.text.length - b.text.length;      // tiebreak: shorter code first
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
  }, [materials, universeData, planetData, findableMaterialIds]);


  // EXCESSIVE COMMENTING: Cheap guard used to suppress the FIO network call. Returns true when the typed term EXACTLY matches a known Resource (ticker/name) or Planet (natural id / name). In those cases the term already cleanly resolves to a local entity, so pinging FIO for a same-named corporation would be wasted traffic.
  const hasExactLocalMatch = useCallback((term) => {
    const lowerTerm = (term || '').toLowerCase().trim();
    if (!lowerTerm) return false;

    if (materials && materials.some(m =>
        findableMaterialIds.has(m.MaterialId) &&
        (m.Ticker.toLowerCase() === lowerTerm || m.Name.toLowerCase() === lowerTerm))) {
        return true;
    }

    if (planetData && Object.values(planetData).some(planets =>
        planets.some(p =>
            p.PlanetNaturalId.toLowerCase() === lowerTerm ||
            p.PlanetName.toLowerCase() === lowerTerm))) {
        return true;
    }

    return false;
  }, [materials, planetData, findableMaterialIds]);


  // EXCESSIVE COMMENTING: Isolated FIO corporation lookup. Returns a single Corporation suggestion (or null). Kept separate from local suggestions so the UI can place it on its own, longer (1s) debounce.
  const fetchFioCompany = useCallback(async (term) => {
    const sanitizedForFio = sanitizeInput(term);
    if (sanitizedForFio.length === 0 || sanitizedForFio.length > 8) return null;
    try {
        const response = await fetch(`https://rest.fnar.net/company/code/${sanitizedForFio}`);
        if (response.ok) {
            const data = await response.json();
            if (data && data.Planets && data.Planets.length > 0) {
                // EXCESSIVE COMMENTING: Stash the full payload so executing this corp search reuses it instead of re-fetching. Key by both the typed code and the canonical FIO Code to cover either lookup path.
                fioCompanyCacheRef.current.set(sanitizedForFio.toUpperCase(), data);
                if (data.Code) fioCompanyCacheRef.current.set(data.Code.toUpperCase(), data);
                return {
                  text: data.Code || sanitizedForFio.toUpperCase(),
                  label: data.Name || 'FIO Corporation',
                  category: 'Corporation'
                };
            }
        }
    } catch (error) {}
    return null;
  }, []);


  const executeUnifiedSearch = useCallback(async (option) => {
    lastQueryRef.current = option;
    clearHighlights();
    
    let results = [];
    if (option.category === 'Corporation') {
        setIsCompanySearch(true);
        results = await handleCompanySearch(option.text);
    } else if (option.category === 'Resource') {
        setIsCompanySearch(false);
        results = handleMaterialSearch(option.text);
    } else {
        setIsCompanySearch(false);
        results = handleSystemSearch(option.text);
    }
    return results;
  }, [handleCompanySearch, handleMaterialSearch, handleSystemSearch]);


  const clearSearch = useCallback(() => {
    setUnifiedSearchTerm('');
    setSearchMaterial([]);
    setSearchMaterialConcentrationLiquid([]);
    setSearchMaterialConcentrationGaseous([]);
    setSearchMaterialConcentrationMineral([]);

    // EXCESSIVE COMMENTING: Return to the same blank state as initial page load — drop the active query and wipe all highlights, rather than running a General search that would re-highlight the entire filtered universe.
    lastQueryRef.current = { text: '', category: 'General' };
    setSearchResults([]);
    setIsCompanySearch(false);
    clearHighlights();
  }, []);

  const updateFilters = useCallback((newFilters) => {
    setFilters(newFilters);
  }, []);


  // EXCESSIVE COMMENTING: Snapshot of the filter values, used to distinguish a genuine filter change from incidental re-renders (e.g. data/callback identity churn during initial load).
  const prevFilterSnapshotRef = useRef(null);

  useEffect(() => {
    if (!(planetData && Object.keys(planetData).length > 0)) return;

    const snapshot = JSON.stringify({ filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter });

    // First time data is ready: record the baseline and skip the auto-run. This prevents the empty/General query from highlighting the entire universe on initial page load.
    if (prevFilterSnapshotRef.current === null) {
      prevFilterSnapshotRef.current = snapshot;
      return;
    }

    // Ignore effect runs where no filter value actually changed (identity churn from planetData / executeUnifiedSearch settling).
    if (prevFilterSnapshotRef.current === snapshot) return;
    prevFilterSnapshotRef.current = snapshot;

    // A filter genuinely changed — re-apply the active search (even an empty/General query, so filters refine the full universe as intended).
    const timer = setTimeout(() => {
       executeUnifiedSearch(lastQueryRef.current);
    }, 100);
    return () => clearTimeout(timer);
  }, [filters, resourceThreshold, isRelativeThreshold, resourceTypeFilter, executeUnifiedSearch, planetData]);


  return (
    <SearchContext.Provider
      value={{
        searchResults,
        searchMaterial,
        searchMaterialConcentrationLiquid,
        searchMaterialConcentrationMineral,
        searchMaterialConcentrationGaseous,
        clearSearch,
        filters,
        updateFilters,
        unifiedSearchTerm,
        setUnifiedSearchTerm,
        showAdvanced,
        setShowAdvanced,
        resourceThreshold,
        setResourceThreshold,
        isRelativeThreshold,
        setIsRelativeThreshold,
        resourceTypeFilter,
        setResourceTypeFilter,
        isCompanySearch,
        generateLocalSuggestions,
        hasExactLocalMatch,
        fetchFioCompany,
        executeUnifiedSearch
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};