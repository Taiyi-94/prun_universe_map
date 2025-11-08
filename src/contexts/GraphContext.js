import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from 'react';
import { findShortestPath as findShortestPathUtil, highlightPath } from '../utils/graphUtils';
import { AuthContext } from './AuthContext';

export const GraphContext = createContext();

export const GraphProvider = ({ children }) => {
  const [graph, setGraph] = useState({ nodes: {}, edges: [] });
  const [materials, setMaterials] = useState({});
  const [selectedSystems, setSelectedSystems] = useState([]);
  const [planetData, setPlanetData] = useState({});
  const [universeData, setUniverseData] = useState({});
  const [ships, setShips] = useState([]);
  const [flights, setFlights] = useState([]);
  const [storageData, setStorageData] = useState([]);
  const { authToken } = useContext(AuthContext);

  useEffect(() => {
    console.log('Fetching graph data');
    fetch('graph_data.json')
      .then(response => response.json())
      .then(data => {
        setGraph(data);
      })
      .catch(error => {
        console.error('Error fetching graph data:', error);
      });

    fetch('material_data.json')
      .then(response => response.json())
      .then(data => {
        setMaterials(data);
      })
      .catch(error => {
        console.error('Error fetching material data:', error);
      });

    fetch('prun_universe_data.json')
      .then(response => response.json())
      .then(data => {
        // Group planets by SystemId
        const groupedUniverseData = data.reduce((acc, system) => {
          if (!acc[system.SystemId]) {
            acc[system.SystemId] = [];
          }
          acc[system.SystemId].push(system);
          return acc;
        }, {});
        setUniverseData(groupedUniverseData);
      })
      .catch(error => {
        console.error('Error fetching universe data:', error);
      });

    // Fetch planet data
    fetch('planet_data.json')
      .then(response => response.json())
      .then(data => {
        // Group planets by SystemId
        const groupedPlanetData = data.reduce((acc, planet) => {
          if (!acc[planet.SystemId]) {
            acc[planet.SystemId] = [];
          }
          acc[planet.SystemId].push(planet);
          return acc;
        }, {});
        setPlanetData(groupedPlanetData);
      })
      .catch(error => {
        console.error('Error fetching planet data:', error);
      });

  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!authToken) {
      setShips([]);
      setFlights([]);
      setStorageData([]);
      return () => {
        isMounted = false;
      };
    }

    const headerValue = typeof authToken === 'string' ? authToken.trim() : '';

    if (!headerValue) {
      setShips([]);
      setFlights([]);
      return () => {
        isMounted = false;
      };
    }

    const headers = {
      Authorization: headerValue,
      Accept: 'application/json'
    };

    const fetchShips = async () => {
      try {
        const response = await fetch('https://rest.fnar.net/ship/ships/OptimizedFunction', {
          headers
        });

        if (!response.ok) {
          throw new Error(`Ships request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!isMounted) return;
        const shipsPayload = Array.isArray(data) ? data : (data?.Ships || data?.ships || []);
        setShips(Array.isArray(shipsPayload) ? shipsPayload : []);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching ships:', error);
        setShips([]);
      }
    };

    const fetchFlights = async () => {
      try {
        const response = await fetch('https://rest.fnar.net/ship/flights/OptimizedFunction', {
          headers
        });

        if (!response.ok) {
          throw new Error(`Flights request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!isMounted) return;
        const flightsPayload = Array.isArray(data) ? data : (data?.Flights || data?.flights || []);
        setFlights(Array.isArray(flightsPayload) ? flightsPayload : []);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching flights:', error);
        setFlights([]);
      }
    };

    const fetchStorage = async () => {
      try {
        const response = await fetch('https://rest.fnar.net/storage/OptimizedFunction', {
          headers
        });

        if (!response.ok) {
          throw new Error(`Storage request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!isMounted) return;
        const storagePayload = Array.isArray(data) ? data : (data?.Storage || data?.Storages || data?.storage || data?.storages || []);
        setStorageData(Array.isArray(storagePayload) ? storagePayload : []);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching storage data:', error);
        setStorageData([]);
      }
    };

    fetchShips();
    fetchFlights();
    fetchStorage();

    return () => {
      isMounted = false;
    };
  }, [authToken]);

  const findShortestPath = useCallback((system1, system2) => {
    findShortestPathUtil(graph, system1, system2, highlightPath);
  }, [graph]);


  return (
    <GraphContext.Provider
      value={{
        graph,
        setGraph,
        materials,
        setMaterials,
        selectedSystems,
        setSelectedSystems,
        findShortestPath,
        planetData,
        universeData,
        ships,
        flights,
        storageData,
        setShips,
        setFlights
      }}
    >
      {children}
    </GraphContext.Provider>
  );
};