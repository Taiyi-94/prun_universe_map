import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { findShortestPath as findShortestPathUtil, highlightPath } from '../utils/graphUtils';
import { AuthContext } from './AuthContext';
import { getFirestoreClient } from '../utils/firebaseClient';
import { SIL_TRACKER_API_KEY, SIL_TRACKER_USERNAME } from '../constants/silTracking';

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
  const [contracts, setContracts] = useState([]);
  const [contractSnapshot, setContractSnapshot] = useState([]);
  const { authToken, userName } = useContext(AuthContext);

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

    const rawUserName = authToken === SIL_TRACKER_API_KEY
      ? SIL_TRACKER_USERNAME
      : userName;
    const normalizedUserName = typeof rawUserName === 'string' ? rawUserName.trim() : '';

    if (!authToken || !normalizedUserName) {
      setShips([]);
      setFlights([]);
      setStorageData([]);
      setContracts([]);
      setContractSnapshot([]);
      return () => {
        isMounted = false;
      };
    }

    const headerValue = typeof authToken === 'string' ? authToken.trim() : '';

    if (!headerValue) {
      setShips([]);
      setFlights([]);
      setStorageData([]);
      setContracts([]);
      setContractSnapshot([]);
      return () => {
        isMounted = false;
      };
    }

    const encodedUserName = encodeURIComponent(normalizedUserName);

    const headers = {
      Authorization: headerValue,
      Accept: 'application/json'
    };

    setContracts([]);
    setContractSnapshot([]);

    const fetchShips = async () => {
      try {
        const response = await fetch(`https://rest.fnar.net/ship/ships/${encodedUserName}`, {
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
        const response = await fetch(`https://rest.fnar.net/ship/flights/${encodedUserName}`, {
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
        const response = await fetch(`https://rest.fnar.net/storage/${encodedUserName}`, {
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

    const fetchContracts = async () => {
      if (authToken === SIL_TRACKER_API_KEY) {
        return;
      }

      try {
        const response = await fetch(`https://rest.fnar.net/contract/allcontracts/${encodedUserName}`, {
          headers
        });

        if (!response.ok) {
          throw new Error(`Contracts request failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!isMounted) return;
        const contractsPayload = Array.isArray(data)
          ? data
          : (data?.Contracts || data?.contracts || []);
        const normalizedContracts = Array.isArray(contractsPayload) ? contractsPayload : [];
        setContracts(normalizedContracts);
        setContractSnapshot(normalizedContracts);
      } catch (error) {
        if (!isMounted) return;
        console.error('Error fetching contracts:', error);
        setContracts([]);
        setContractSnapshot([]);
      }
    };

    fetchShips();
    fetchFlights();
    fetchStorage();
    fetchContracts();

    return () => {
      isMounted = false;
    };
  }, [authToken, userName]);

  const findShortestPath = useCallback((system1, system2) => {
    findShortestPathUtil(graph, system1, system2, highlightPath);
  }, [graph]);

  useEffect(() => {
    if (authToken !== SIL_TRACKER_API_KEY) {
      return () => { };
    }

    const firestore = getFirestoreClient();
    if (!firestore) {
      console.warn('[GraphContext] Firebase is not configured; SIL tracking snapshot subscription disabled');
      return () => { };
    }

    const docRef = doc(firestore, 'snapshots', 'contracts');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      const data = docSnap.exists() ? docSnap.data() : null;
      const snapshotContracts = Array.isArray(data?.contracts) ? data.contracts : [];
      setContracts(snapshotContracts);
      setContractSnapshot(snapshotContracts);
    }, (error) => {
      console.error('Error subscribing to SIL contract snapshot:', error);
    });

    return () => {
      unsubscribe();
    };
  }, [authToken]);

  const contextValue = useMemo(() => ({
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
    contracts,
    contractSnapshot,
    setShips,
    setFlights,
    setStorageData,
    setContracts,
    setContractSnapshot
  }), [
    graph,
    materials,
    selectedSystems,
    findShortestPath,
    planetData,
    universeData,
    ships,
    flights,
    storageData,
    contracts,
    contractSnapshot
  ]);

  return (
    <GraphContext.Provider value={contextValue}>
      {children}
    </GraphContext.Provider>
  );
};