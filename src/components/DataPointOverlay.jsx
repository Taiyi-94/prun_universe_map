import React, { useEffect, useCallback, useContext, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { useDataPoints } from '../contexts/DataPointContext';
import { GraphContext } from '../contexts/GraphContext';

const DataPointOverlay = ({ mapRef }) => {
  const {
    meteorDensityData,
    luminosityData,
    systemNames,
    isOverlayVisible,
    isLoading,
    error,
    maxValues
  } = useDataPoints();
  const {
    graph,
    ships,
    flights,
    planetData,
    universeData
  } = useContext(GraphContext);
  const [selectedShipId, setSelectedShipId] = useState('__all__');

  const planetLookups = useMemo(() => {
    const byId = new Map();
    const byNaturalId = new Map();

    if (planetData && typeof planetData === 'object') {
      Object.values(planetData).forEach((planetsInSystem) => {
        (planetsInSystem || []).forEach((planet) => {
          if (planet?.PlanetId) {
            byId.set(String(planet.PlanetId).toLowerCase(), planet);
          }
          if (planet?.PlanetNaturalId) {
            byNaturalId.set(String(planet.PlanetNaturalId).toUpperCase(), planet);
          }
        });
      });
    }

    return { byId, byNaturalId };
  }, [planetData]);

  const systemLookups = useMemo(() => {
    const byName = new Map();
    const byNaturalId = new Map();

    Object.entries(systemNames || {}).forEach(([systemId, name]) => {
      if (!systemId || typeof name !== 'string') {
        return;
      }
      byName.set(name.trim().toLowerCase(), systemId);
    });

    if (universeData && typeof universeData === 'object') {
      Object.entries(universeData).forEach(([systemId, entries]) => {
        if (!systemId || !Array.isArray(entries)) {
          return;
        }
        entries.forEach((entry) => {
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const entryName = typeof entry.Name === 'string' ? entry.Name.trim() : null;
          const entryNaturalId = typeof entry.NaturalId === 'string' ? entry.NaturalId.trim() : null;

          if (entryName) {
            byName.set(entryName.toLowerCase(), systemId);
          }

          if (entryNaturalId) {
            byNaturalId.set(entryNaturalId.toUpperCase(), systemId);
          }
        });
      });
    }

    return { byName, byNaturalId };
  }, [systemNames, universeData]);

  const shipOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    (ships || []).forEach((ship) => {
      const id = ship?.ShipId || ship?.Id || ship?.Ship || ship?.Registration || ship?.Name;
      if (!id) return;
      const idStr = String(id);
      if (seen.has(idStr)) return;
      seen.add(idStr);
      const labelBase = ship?.Name || ship?.ShipName || ship?.Registration || ship?.ShipId || ship?.Id || 'Unknown Ship';
      opts.push({ id: idStr, label: labelBase });
    });
    opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return [{ id: '__all__', label: 'All Ships' }, ...opts];
  }, [ships]);

  const handleShipChange = useCallback((event) => {
    setSelectedShipId(event.target.value);
  }, [setSelectedShipId]);

  useEffect(() => {
    if (selectedShipId === '__all__') return;
    const stillExists = (ships || []).some((ship) => {
      const id = ship?.ShipId || ship?.Id || ship?.Ship || ship?.Registration || ship?.Name;
      return id && String(id) === selectedShipId;
    });
    if (!stillExists) {
      setSelectedShipId('__all__');
    }
  }, [ships, selectedShipId]);

  const renderOverlay = useCallback(() => {
    if (!mapRef?.current?.g) return;

    const { byId: planetsById, byNaturalId: planetsByNaturalId } = planetLookups;

    // Clean up existing elements
    mapRef.current.g.selectAll('.meteor-density-group').remove();
    mapRef.current.g.selectAll('.system-name-label').remove();
    mapRef.current.g.selectAll('.ship-group').remove();
    mapRef.current.g.selectAll('.flight-path').remove();

    const { g } = mapRef.current;
    const transform = d3.zoomTransform(g.node());
    const zoomLevel = transform?.k || 1;

    const shipsById = new Map();
    (ships || []).forEach((ship) => {
      const keys = [
        ship?.ShipId,
        ship?.Id,
        ship?.Ship,
        ship?.Registration,
        ship?.Name
      ].filter((candidate) => candidate != null);

      keys.forEach((candidate) => {
        shipsById.set(candidate, ship);
        shipsById.set(String(candidate), ship);
      });
    });

    const flightsByShipId = new Map();
    (flights || []).forEach((flight) => {
      if (flight.ShipId) {
        flightsByShipId.set(flight.ShipId, flight);
      }
    });
    const flightSegmentsCache = new Map();
    const segmentUsageMap = new Map();
    const lineGenerator = d3.line().x((d) => d.x).y((d) => d.y).curve(d3.curveLinear);
    const markerSlotMap = new Map();
    const activeShipIds = new Set();
    const flightDiagnostics = [];

    const getMarkerSlot = (key) => {
      const count = markerSlotMap.get(key) || 0;
      markerSlotMap.set(key, count + 1);
      return count;
    };

    const extractEpochValues = (record, keys) => {
      if (!record) return [];
      return keys.reduce((acc, key) => {
        const raw = record[key];
        if (raw == null) {
          return acc;
        }
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0) {
          acc.push(num);
        }
        return acc;
      }, []);
    };

    const computeFlightTiming = (flightRecord, segments) => {
      const departures = [];
      const arrivals = [];

      segments.forEach((info) => {
        const bounds = info.timeBounds || getSegmentTimeBounds(info.segment);
        if (bounds.departure != null) {
          departures.push(bounds.departure);
        }
        if (bounds.arrival != null) {
          arrivals.push(bounds.arrival);
        }
      });

      departures.push(
        ...extractEpochValues(flightRecord, [
          'DepartureEpochMs',
          'DepartureTimeEpochMs',
          'ScheduledDepartureEpochMs',
          'StartEpochMs',
          'SegmentDepartureEpochMs'
        ])
      );

      arrivals.push(
        ...extractEpochValues(flightRecord, [
          'ArrivalEpochMs',
          'ArrivalTimeEpochMs',
          'ScheduledArrivalEpochMs',
          'EndEpochMs',
          'SegmentArrivalEpochMs'
        ])
      );

      const earliestDeparture = departures.length > 0 ? Math.min(...departures) : null;
      const finalArrival = arrivals.length > 0 ? Math.max(...arrivals) : null;
      const duration = earliestDeparture != null && finalArrival != null
        ? Math.max(0, finalArrival - earliestDeparture)
        : null;

      return {
        departure: earliestDeparture,
        arrival: finalArrival,
        duration
      };
    };

    const getShipLocationSystemId = (ship) => {
      if (!ship) return null;

      const directCandidates = [
        ship.CurrentSystemId,
        ship.SystemId,
        ship.CurrentLocationSystemId,
        ship.LocationSystemId,
        ship.LocationId,
        ship.LocationSystemNaturalId,
        ship.LocationNaturalId,
        ship.LastKnownSystemId,
        ship.LastSystemId,
        ship.LastLocationSystemId,
        ship.HomeSystemId,
        ship.SystemNaturalId
      ];

      for (const candidate of directCandidates) {
        const resolved = resolveSystemId(candidate);
        if (resolved) {
          return resolved;
        }
      }

      const nestedCandidates = [
        ship.CurrentLocation,
        ship.Location,
        ship.DockedAt,
        ship.LastLocation,
        ship.HomeLocation,
        ship.BasedAt,
        ship.Station
      ];

      for (const nested of nestedCandidates) {
        const resolved = extractSystemId(nested);
        if (resolved) {
          return resolved;
        }
      }

      if (ship.LocationLines) {
        const resolved = extractSystemId(ship.LocationLines);
        if (resolved) {
          return resolved;
        }
      }

      return null;
    };

    const shipTypeColors = {
      genfreight: '#f4b400',
      genheavy: '#ff6f59',
      stelmammoth: '#6c5ce7',
      stelraptor: '#f72585',
      koi: '#2ec4b6',
      default: '#7bd389'
    };

    const normalizeShipType = (ship) => {
      if (!ship) return 'default';
      const namePrefix = typeof ship.Name === 'string' ? ship.Name.trim().split(' ')[0].toLowerCase() : null;
      if (namePrefix && shipTypeColors[namePrefix]) {
        return namePrefix;
      }
      const blueprint = typeof ship.BlueprintNaturalId === 'string' ? ship.BlueprintNaturalId.split('-')[1]?.toLowerCase() : null;
      if (blueprint && shipTypeColors[blueprint]) {
        return blueprint;
      }
      return 'default';
    };

    const getShipColor = (ship) => shipTypeColors[normalizeShipType(ship)] || shipTypeColors.default;

    const describeShip = (ship) => ({
      shipId: ship?.ShipId ?? ship?.Id ?? ship?.Ship ?? ship?.Registration ?? null,
      name: ship?.Name ?? ship?.ShipName ?? null,
      blueprint: ship?.BlueprintNaturalId ?? ship?.Blueprint ?? null,
      status: ship?.Status ?? ship?.ShipStatus ?? ship?.State ?? null,
      inTransit: ship?.InTransit ?? ship?.IsInTransit ?? ship?.TravelState ?? null,
      currentSystemId: ship?.CurrentSystemId ?? ship?.SystemId ?? null,
      location: ship?.Location ?? ship?.LocationLines ?? ship?.CurrentLocation ?? ship?.AddressLines ?? null
    });

    const safeString = (value) => (typeof value === 'string' ? value.trim() : value);

    const resolveSystemId = (candidate) => {
      const id = safeString(candidate);
      if (!id) return null;
      if (systemNames?.[id]) return id;
      if (graph?.systems?.[id]) return id;
      if (graph?.nodes?.[id]) return id;
      if (graph?.nodes && typeof graph.nodes.get === 'function' && graph.nodes.get(id)) return id;

      if (typeof id === 'string') {
        const normalizedName = id.trim().toLowerCase();
        if (systemLookups.byName.has(normalizedName)) {
          return systemLookups.byName.get(normalizedName);
        }

        const cleanedName = normalizedName
          .replace(/\bstation\b/g, '')
          .replace(/[^a-z0-9\s-]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanedName && systemLookups.byName.has(cleanedName)) {
          return systemLookups.byName.get(cleanedName);
        }

        const parenMatch = id.match(/\(([A-Za-z0-9\-]+)\)/);
        if (parenMatch) {
          const naturalIdCandidate = parenMatch[1].toUpperCase();
          if (systemLookups.byNaturalId.has(naturalIdCandidate)) {
            return systemLookups.byNaturalId.get(naturalIdCandidate);
          }
        }

        const upperCandidate = id.toUpperCase();
        if (systemLookups.byNaturalId.has(upperCandidate)) {
          return systemLookups.byNaturalId.get(upperCandidate);
        }
      }

      return null;
    };

    const extractSystemId = (lines) => {
      if (!lines) return null;
      const entries = Array.isArray(lines) ? lines : [lines];
      for (const entry of entries) {
        if (typeof entry === 'string') {
          const resolved = resolveSystemId(entry);
          if (resolved) return resolved;
          continue;
        }
        if (entry && typeof entry === 'object') {
          const candidates = [
            entry.SystemId,
            entry.SystemNaturalId,
            entry.OriginSystemId,
            entry.DestinationSystemId,
            entry.NaturalId,
            entry.LineId,
            entry.LineNaturalId,
            entry.Id,
            entry.Line,
            entry.Address,
            entry.From,
            entry.To
          ];
          for (const candidate of candidates) {
            const resolved = resolveSystemId(candidate);
            if (resolved) return resolved;
          }
        }
      }
      return null;
    };

    const extractLocationDetails = (lines) => {
      const entries = Array.isArray(lines) ? lines : (lines ? [lines] : []);
      let systemId = null;
      let systemName = null;
      let systemNaturalId = null;
      let planetId = null;
      let planetNaturalId = null;
      let planetName = null;
      let stationId = null;
      let stationNaturalId = null;
      let stationName = null;

      let displayKind = null;
      let displayPriority = Number.POSITIVE_INFINITY;
      let displayLabel = null;

      const setDisplayCandidate = (kind, label, priority) => {
        if (label == null) {
          return;
        }
        if (priority < displayPriority) {
          displayPriority = priority;
          displayKind = kind;
          displayLabel = label;
        } else if (priority === displayPriority && !displayLabel) {
          displayKind = kind;
          displayLabel = label;
        }
      };

      const applyPlanetEntry = (planetEntry, fallbackId, fallbackNaturalId, fallbackName) => {
        if (!planetEntry && fallbackId == null && fallbackNaturalId == null && fallbackName == null) {
          return false;
        }

        if (!planetId && (planetEntry?.PlanetId != null || fallbackId != null)) {
          planetId = planetEntry?.PlanetId != null
            ? String(planetEntry.PlanetId)
            : String(fallbackId);
        }

        if (!planetNaturalId && (planetEntry?.PlanetNaturalId || fallbackNaturalId)) {
          const rawNaturalId = planetEntry?.PlanetNaturalId || fallbackNaturalId;
          planetNaturalId = rawNaturalId != null ? String(rawNaturalId).toUpperCase() : planetNaturalId;
        }

        if (!planetName && (planetEntry?.PlanetName || fallbackName || planetNaturalId || planetId)) {
          planetName = planetEntry?.PlanetName
            || fallbackName
            || planetNaturalId
            || planetId
            || planetName;
        }

        if (!systemNaturalId && planetEntry?.SystemNaturalId != null) {
          systemNaturalId = String(planetEntry.SystemNaturalId);
        }

        if (!systemId && planetEntry?.SystemId) {
          systemId = planetEntry.SystemId;
        }

        if (!systemName && planetEntry?.SystemId) {
          systemName = systemNames?.[planetEntry.SystemId]
            || systemNaturalId
            || systemName;
        }

        setDisplayCandidate('planet', planetName || fallbackName || planetNaturalId || planetId, 0);
        return Boolean(planetEntry);
      };

      const applyStationEntry = (entryObj, lineId, lineNaturalId, lineName) => {
        const stationIdCandidate = entryObj?.StationId
          || entryObj?.StationIdentifier
          || entryObj?.Identifier
          || lineId;
        const stationNaturalIdCandidate = entryObj?.StationNaturalId
          || entryObj?.NaturalId
          || lineNaturalId;
        const stationNameCandidate = lineName
          || entryObj?.StationName
          || entryObj?.Name
          || entryObj?.DisplayName
          || null;

        if (!stationId && stationIdCandidate) {
          stationId = String(stationIdCandidate);
        }
        if (!stationNaturalId && stationNaturalIdCandidate) {
          stationNaturalId = String(stationNaturalIdCandidate).toUpperCase();
        }
        if (!stationName && (stationNameCandidate || stationNaturalId || stationId)) {
          stationName = stationNameCandidate || stationNaturalId || stationId;
        }

        if (!systemId) {
          const candidateSystemId = entryObj?.SystemId || entryObj?.SystemNaturalId;
          const resolvedSystem = resolveSystemId(candidateSystemId);
          if (resolvedSystem) {
            systemId = resolvedSystem;
          }
        }

        if (!systemNaturalId && entryObj?.SystemNaturalId) {
          systemNaturalId = entryObj.SystemNaturalId;
        }

        if (!systemName && systemId) {
          systemName = systemNames?.[systemId] || systemNaturalId || systemName;
        }

        setDisplayCandidate('station', stationName || stationNaturalId || stationId, 1);
      };

      const resolvePlanetCandidate = (value, fallbackName) => {
        const raw = safeString(value);
        if (!raw) {
          return false;
        }

        const planetEntry = planetsById.get(String(raw).toLowerCase())
          || planetsByNaturalId.get(String(raw).toUpperCase());

        if (planetEntry) {
          applyPlanetEntry(planetEntry, raw, raw, fallbackName || planetEntry.PlanetName || raw);
          return true;
        }

        return false;
      };

      entries.forEach((entry) => {
        if (typeof entry === 'string') {
          const handledAsPlanet = resolvePlanetCandidate(entry);
          if (handledAsPlanet) {
            return;
          }

          const resolved = resolveSystemId(entry);
          if (resolved && !systemId) {
            systemId = resolved;
          }
          if (!systemName) {
            systemName = (resolved && systemNames?.[resolved]) || entry;
            if (systemName) {
              setDisplayCandidate('system', systemName, 2);
            }
          }
          return;
        }

        if (!entry || typeof entry !== 'object') {
          return;
        }

        const typeRaw = entry.Type || entry.type || entry.LineType || entry.lineType || entry.Category || entry.category || null;
        const type = typeof typeRaw === 'string' ? typeRaw.toLowerCase() : '';
        const lineId = entry.LineId || entry.Id || entry.Identifier || entry.Line || entry.Value;
        const lineNaturalId = entry.LineNaturalId || entry.NaturalId || entry.Code;
        const lineName = entry.LineName || entry.Name || entry.DisplayName;
        const baseName = lineName
          || (lineNaturalId ? String(lineNaturalId).toUpperCase() : null)
          || (lineId ? String(lineId) : null);

        if (type === 'station') {
          applyStationEntry(entry, lineId, lineNaturalId, lineName);
        }

        if (type === 'planet') {
          if (!planetId && lineId) {
            planetId = String(lineId);
          }
          if (!planetNaturalId && lineNaturalId) {
            planetNaturalId = String(lineNaturalId).toUpperCase();
          }
          if (!planetName && baseName) {
            planetName = baseName;
          }
        }

        const planetIdentifiers = [
          entry.PlanetId,
          entry.PlanetNaturalId,
          entry.Planet,
          entry.PlanetIdentifier,
          lineId,
          lineNaturalId
        ];

        const planetResolved = planetIdentifiers.some((identifier) => resolvePlanetCandidate(identifier, lineName));
        if (planetResolved) {
          if (!systemName && systemId) {
            systemName = systemNames?.[systemId] || systemNaturalId || systemName;
          }
        } else if (type === 'planet') {
          setDisplayCandidate('planet', planetName || baseName || planetNaturalId || planetId, 0);
        }

        if (!systemNaturalId && entry.SystemNaturalId) {
          systemNaturalId = entry.SystemNaturalId;
        }

        if (!systemId) {
          const candidates = [
            entry.SystemId,
            entry.SystemNaturalId,
            entry.OriginSystemId,
            entry.DestinationSystemId,
            entry.FromSystemId,
            entry.ToSystemId,
            lineId,
            lineNaturalId,
            entry.Id,
            entry.Line,
            entry.Address,
            entry.From,
            entry.To
          ];

          for (const candidate of candidates) {
            const resolved = resolveSystemId(candidate);
            if (resolved) {
              systemId = resolved;
              break;
            }
          }
        }

        if (!systemName) {
          const resolvedName = systemId ? systemNames?.[systemId] : null;
          const fallbackName = baseName || systemNaturalId || systemId;
          systemName = resolvedName || systemNaturalId || fallbackName || systemName;
        }

        if (systemName) {
          setDisplayCandidate('system', systemName, 2);
        }
      });

      if (!systemId) {
        const fallback = extractSystemId(lines);
        if (fallback) {
          systemId = fallback;
        }
      }

      if (!systemName && systemId) {
        systemName = systemNames?.[systemId] || systemNaturalId || systemId;
        if (systemName) {
          setDisplayCandidate('system', systemName, 2);
        }
      }

      if (displayLabel == null) {
        if (planetName || planetNaturalId || planetId) {
          displayKind = 'planet';
          displayPriority = 0;
          displayLabel = planetName || planetNaturalId || planetId;
        } else if (stationName || stationNaturalId || stationId) {
          displayKind = 'station';
          displayPriority = 1;
          displayLabel = stationName || stationNaturalId || stationId;
        } else if (systemName) {
          displayKind = 'system';
          displayPriority = 2;
          displayLabel = systemName;
        }
      }

      return {
        systemId,
        systemName,
        systemNaturalId,
        planetId,
        planetNaturalId,
        planetName,
        stationId,
        stationNaturalId,
        stationName,
        displayName: displayLabel || planetName || stationName || systemName || systemNaturalId || systemId || null,
        displayKind,
        displayPriority: Number.isFinite(displayPriority) ? displayPriority : null
      };
    };

    const getCandidateLabel = (candidate) => {
      if (!candidate) {
        return '';
      }
      const label = candidate.displayName
        || candidate.stationName
        || candidate.planetName
        || candidate.systemName
        || candidate.systemNaturalId
        || candidate.stationNaturalId
        || candidate.planetNaturalId
        || candidate.systemId
        || candidate.stationId
        || candidate.planetId
        || '';
      return typeof label === 'string' ? label.trim() : '';
    };

    const isGenericLabel = (candidate) => {
      const label = getCandidateLabel(candidate).toLowerCase();
      if (!label) {
        return true;
      }
      return label === 'station' || label === 'system' || label === 'planet';
    };

    const hasExplicitIdentifier = (candidate) => Boolean(
      candidate?.stationNaturalId
      || candidate?.stationId
      || candidate?.planetNaturalId
      || candidate?.planetId
    );

    const selectDisplayLocation = (...candidates) => {
      let best = null;
      let bestPriority = Number.POSITIVE_INFINITY;

      candidates.forEach((candidate) => {
        if (!candidate) {
          return;
        }
        const derivedPriority = candidate.displayPriority
          ?? ((candidate.planetId || candidate.planetNaturalId)
            ? 0
            : (candidate.stationId || candidate.stationNaturalId ? 1 : (candidate.systemId ? 2 : 5)));

        if (!best || derivedPriority < bestPriority) {
          best = candidate;
          bestPriority = derivedPriority;
          return;
        }

        if (derivedPriority !== bestPriority) {
          return;
        }

        const bestIsGeneric = isGenericLabel(best);
        const candidateIsGeneric = isGenericLabel(candidate);
        const bestLabel = getCandidateLabel(best);
        const candidateLabel = getCandidateLabel(candidate);
        const candidateHasId = hasExplicitIdentifier(candidate);
        const bestHasId = hasExplicitIdentifier(best);

        if (candidateHasId && !bestHasId) {
          best = candidate;
          return;
        }

        if (!candidateIsGeneric && bestIsGeneric) {
          best = candidate;
          return;
        }

        if (candidateLabel && !bestLabel) {
          best = candidate;
          return;
        }

        if (candidateLabel && bestLabel && candidateLabel.length > bestLabel.length + 2) {
          best = candidate;
        }
      });

      return best;
    };

    const buildSystemOnlyLocation = (systemId) => {
      const resolvedId = resolveSystemId(systemId);
      if (!resolvedId) {
        return null;
      }
      const systemLabel = systemNames?.[resolvedId] || resolvedId;
      return {
        systemId: resolvedId,
        systemName: systemLabel,
        systemNaturalId: resolvedId,
        displayName: systemLabel,
        displayKind: 'system',
        displayPriority: 2
      };
    };

    const deriveLocationFromLabel = (labelValue) => {
      if (typeof labelValue !== 'string') {
        return null;
      }

      const segments = labelValue.split(' - ').map((part) => part.trim()).filter(Boolean);
      if (segments.length === 0) {
        return null;
      }

      const parseSegment = (segment) => {
        if (!segment) return null;
        const match = segment.match(/^(.*)\s+\(([A-Za-z0-9\-]+)\)$/);
        if (match) {
          return { name: match[1].trim(), naturalId: match[2].trim() };
        }
        return { name: segment.trim(), naturalId: null };
      };

      const entries = [];
      const systemInfo = parseSegment(segments[0]);
      if (systemInfo?.name) {
        entries.push({
          Type: 'system',
          LineName: systemInfo.name,
          LineNaturalId: systemInfo.naturalId || null,
          Name: systemInfo.name,
          NaturalId: systemInfo.naturalId || null
        });
      }

      for (let i = 1; i < segments.length; i += 1) {
        const info = parseSegment(segments[i]);
        if (!info?.name) {
          continue;
        }
        const lowered = info.name.toLowerCase();

        if (lowered.includes('station')) {
          entries.push({
            Type: 'station',
            LineName: info.name,
            LineNaturalId: info.naturalId || null,
            StationName: info.name,
            StationNaturalId: info.naturalId || null
          });
          continue;
        }

        if (lowered.includes('orbit')) {
          continue;
        }

        entries.push({
          Type: 'planet',
          LineName: info.name,
          LineNaturalId: info.naturalId || null,
          PlanetName: info.name,
          PlanetNaturalId: info.naturalId || null
        });
      }

      if (entries.length === 0) {
        return null;
      }

      const derived = extractLocationDetails(entries);
      if (!derived) {
        return null;
      }

      if (!derived.systemName && systemInfo?.name) {
        derived.systemName = systemInfo.name;
      }
      if (!derived.systemNaturalId && systemInfo?.naturalId) {
        derived.systemNaturalId = systemInfo.naturalId;
      }

      return derived;
    };

    const getShipLocationDetails = (ship, fallbackSystemId = null) => {
      if (!ship) {
        return buildSystemOnlyLocation(fallbackSystemId);
      }

      const candidates = [
        extractLocationDetails(ship.AddressLines),
        extractLocationDetails(ship.LocationLines),
        extractLocationDetails(ship.CurrentLocationLines),
        extractLocationDetails(ship.LastLocationLines),
        extractLocationDetails(ship.HomeLocationLines),
        extractLocationDetails(ship.DockingLines),
        extractLocationDetails(ship.DockedAt),
        extractLocationDetails(ship.LastLocation),
        extractLocationDetails(ship.HomeLocation),
        deriveLocationFromLabel(ship.Location),
        deriveLocationFromLabel(ship.LastLocation),
        deriveLocationFromLabel(ship.HomeLocation),
        buildSystemOnlyLocation(fallbackSystemId)
      ].filter(Boolean);

      if (candidates.length === 0) {
        return buildSystemOnlyLocation(fallbackSystemId);
      }

      return selectDisplayLocation(...candidates);
    };

    const formatLocationDisplay = (location) => {
      if (!location) return 'Unknown';

      const label = location.displayName
        || location.planetName
        || location.stationName
        || location.systemName
        || null;

      if (location.displayKind === 'station' || location.stationName || location.stationNaturalId) {
        const identifier = location.stationNaturalId || location.stationId;
        if (label && identifier && label !== identifier) {
          return `${label} (${identifier})`;
        }
        return label || identifier || 'Unknown';
      }

      const planetIdentifier = location.planetNaturalId || location.planetId;
      if (planetIdentifier) {
        const name = label || location.planetName;
        if (name && name !== planetIdentifier) {
          return `${name} (${planetIdentifier})`;
        }
        return planetIdentifier;
      }

      if (label) {
        return label;
      }

      return location.systemName
        || location.systemNaturalId
        || location.systemId
        || 'Unknown';
    };

    const getSystemCenter = (systemId) => {
      const id = safeString(systemId);
      if (!id) return null;
      try {
        const rect = g.select(`rect[id="${id}"]`);
        if (!rect.empty()) {
          const x = parseFloat(rect.attr('x'));
          const y = parseFloat(rect.attr('y'));
          const w = parseFloat(rect.attr('width')) || 0;
          const h = parseFloat(rect.attr('height')) || 0;
          return { x: x + w / 2, y: y + h / 2 };
        }

        const circle = g.select(`circle[id="${id}"]`);
        if (!circle.empty()) {
          const cx = parseFloat(circle.attr('cx'));
          const cy = parseFloat(circle.attr('cy'));
          if (!Number.isNaN(cx) && !Number.isNaN(cy)) {
            return { x: cx, y: cy };
          }
        }

        const node = g.select(`[id="${id}"]`);
        if (!node.empty() && typeof node.node === 'function') {
          const element = node.node();
          if (element?.getBBox) {
            const bbox = element.getBBox();
            if (bbox) {
              return {
                x: bbox.x + bbox.width / 2,
                y: bbox.y + bbox.height / 2
              };
            }
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to compute system center', systemId, err);
      }

      const graphNode = graph?.systems?.[id];
      if (graphNode && Number.isFinite(graphNode.x) && Number.isFinite(graphNode.y)) {
        return { x: graphNode.x, y: graphNode.y };
      }

      return null;
    };

    const clamp01 = (val) => Math.max(0, Math.min(1, val));

    const formatEpoch = (epoch) => {
      if (epoch == null) return 'Unknown';
      const value = Number(epoch);
      if (Number.isNaN(value) || value <= 0) return 'Unknown';
      return new Date(value).toLocaleString();
    };

    const formatDuration = (ms) => {
      if (typeof ms !== 'number' || Number.isNaN(ms) || !Number.isFinite(ms)) return '—';
      if (ms <= 0) return '0m';
      const totalSeconds = Math.floor(ms / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const parts = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
      if (hours === 0 && minutes < 5 && seconds > 0) parts.push(`${seconds}s`);
      if (parts.length === 0) return `${seconds}s`;
      return parts.join(' ');
    };

    const getOffsetSlotForSegment = (key) => {
      const usage = segmentUsageMap.get(key) || { count: 0 };
      const slot = usage.count;
      usage.count += 1;
      segmentUsageMap.set(key, usage);
      return slot;
    };

    const computeOffsetIndex = (slot) => {
      if (slot === 0) return 0;
      const magnitude = Math.floor((slot + 1) / 2);
      return slot % 2 === 1 ? magnitude : -magnitude;
    };

    const getSegmentTimeBounds = (segment) => {
      if (!segment) {
        return { departure: null, arrival: null, duration: null };
      }
      const departure = segment.SegmentDepartureEpochMs ?? segment.DepartureEpochMs ?? segment.SegmentDepartureTimeEpochMs ?? segment.DepartureTimeEpochMs ?? null;
      const arrival = segment.SegmentArrivalEpochMs ?? segment.ArrivalEpochMs ?? segment.SegmentArrivalTimeEpochMs ?? segment.ArrivalTimeEpochMs ?? null;
      const duration = segment.DurationMs ?? segment.SegmentDurationMs ?? (arrival && departure ? arrival - departure : null);
      return {
        departure: typeof departure === 'number' ? departure : Number(departure) || null,
        arrival: typeof arrival === 'number' ? arrival : Number(arrival) || null,
        duration: typeof duration === 'number' ? duration : Number(duration) || null
      };
    };

    const interpolateShipPosition = (ship, segments, flightContext) => {
      if (!ship || !segments?.length) return null;

      const shipKey = ship.ShipId || ship.Id || ship.Ship;
      const activeFlight = flightContext || (shipKey ? flightsByShipId.get(shipKey) : null);

      const segmentIndexCandidates = [
        activeFlight?.CurrentSegmentIndex,
        ship?.CurrentSegmentIndex,
        ship?.SegmentIndex,
        ship?.CurrentSegment
      ].filter((value) => typeof value === 'number' && !Number.isNaN(value));

      const selectedIndex = segmentIndexCandidates.length > 0
        ? Math.max(0, Math.min(segments.length - 1, segmentIndexCandidates[0]))
        : segments.length - 1;

      const segmentInfo = segments[selectedIndex];
      if (!segmentInfo) return segments[segments.length - 1]?.toCenter || null;

      const { fromCenter, toCenter, segment, timeBounds } = segmentInfo;
      if (!fromCenter || !toCenter) {
        return toCenter || fromCenter || null;
      }

      const bounds = timeBounds || getSegmentTimeBounds(segment);
      const { departure, arrival, duration } = bounds;
      let progress = null;

      if (departure && arrival && arrival > departure) {
        progress = clamp01((Date.now() - departure) / (arrival - departure));
      } else if (typeof duration === 'number' && duration > 0 && departure) {
        progress = clamp01((Date.now() - departure) / duration);
      }

      if (progress == null) {
        const progressCandidates = [activeFlight?.Progress, ship?.Progress, ship?.SegmentProgress, ship?.Completion];
        const validProgress = progressCandidates.find((value) => value != null && !Number.isNaN(Number(value)));
        if (validProgress != null) {
          progress = clamp01(Number(validProgress));
        }
      }

      if (progress == null) {
        progress = selectedIndex >= segments.length - 1 ? 1 : 0;
      }

      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const length = Math.hypot(dx, dy) || 1;
      const direction = { x: dx / length, y: dy / length };

      return {
        x: fromCenter.x + dx * progress,
        y: fromCenter.y + dy * progress,
        direction,
        fromId: segmentInfo.fromId,
        toId: segmentInfo.toId,
        fromLocation: segmentInfo.fromLocation,
        toLocation: segmentInfo.toLocation,
        progress,
        segmentInfo,
        segmentIndex: selectedIndex,
        totalSegments: segments.length,
        timeBounds: { departure, arrival, duration }
      };
    };

    if (graph && (ships?.length > 0 || flights?.length > 0)) {
      (flights || []).forEach((flight) => {
        const flightShipId = flight?.ShipId ?? flight?.shipId ?? flight?.Ship ?? null;
        const flightShipIdStr = flightShipId != null ? String(flightShipId) : null;
        if (flightShipIdStr === 'GenFreight 1' || flight?.Name === 'GenFreight 1' || flight?.ShipName === 'GenFreight 6') {
          const shipForFlight = shipsById.get(flight.ShipId) || null;
          const hasSegments = Array.isArray(flight.Segments) && flight.Segments.length > 0;
          const segmentSummary = hasSegments
            ? flight.Segments.map((segment, index) => ({
              index,
              origin: segment?.OriginLines,
              destination: segment?.DestinationLines,
              dep: segment?.DepartureTimeEpochMs || segment?.DepartureEpochMs,
              arr: segment?.ArrivalTimeEpochMs || segment?.ArrivalEpochMs
            }))
            : [];

          // eslint-disable-next-line no-console
          console.debug('[GenFreight 6][flight-precheck]', {
            flightIndex: flightSegmentsCache.size,
            flightId: flight.FlightId,
            shipId: flightShipIdStr,
            flightOrigin: flight.Origin,
            flightDestination: flight.Destination,
            shipForFlight,
            hasSegments,
            segmentsCount: Array.isArray(flight.Segments) ? flight.Segments.length : 0,
            segmentSummary
          });
        }

        if (selectedShipId !== '__all__' && flightShipIdStr !== selectedShipId) {
          return;
        }
        const ship = shipsById.get(flight.ShipId) || null;
        if (ship?.Name === 'GenFreight 6' || ship?.ShipName === 'GenFreight 6' || flightShipIdStr === 'GenFreight 6') {
          const originCandidate = selectDisplayLocation(
            deriveLocationFromLabel(flight.Origin),
            segmentPairs.meta?.firstLocation,
            segmentPairs[0]?.fromLocation
          );
          const destinationCandidate = selectDisplayLocation(
            deriveLocationFromLabel(flight.Destination),
            segmentPairs.meta?.finalLocation,
            segmentPairs[segmentPairs.length - 1]?.toLocation
          );

          // eslint-disable-next-line no-console
          console.debug('[GenFreight 6][flight-after-segments]', {
            flightShipId: flightShipIdStr,
            flightId: flight.FlightId,
            originLabel: flight.Origin,
            destinationLabel: flight.Destination,
            hasSegments: segmentPairs.length > 0,
            segmentPairsCount: segmentPairs.length,
            firstLocationMeta: segmentPairs.meta?.firstLocation,
            finalLocationMeta: segmentPairs.meta?.finalLocation,
            resolvedOrigin: originCandidate,
            resolvedDestination: destinationCandidate,
            firstSegment: segmentPairs[0] || null,
            lastSegment: segmentPairs[segmentPairs.length - 1] || null
          });
        }
        const pathColor = getShipColor(ship);
        const originLabelLocation = deriveLocationFromLabel(flight.Origin);
        const destinationLabelLocation = deriveLocationFromLabel(flight.Destination);
        const segmentsRaw = Array.isArray(flight.Segments) ? [...flight.Segments] : [];
        segmentsRaw.sort((a, b) => {
          const aStart = Number.isFinite(a?.DepartureTimeEpochMs)
            ? Number(a.DepartureTimeEpochMs)
            : (Number.isFinite(a?.ArrivalTimeEpochMs) ? Number(a.ArrivalTimeEpochMs) : 0);
          const bStart = Number.isFinite(b?.DepartureTimeEpochMs)
            ? Number(b.DepartureTimeEpochMs)
            : (Number.isFinite(b?.ArrivalTimeEpochMs) ? Number(b.ArrivalTimeEpochMs) : 0);
          return aStart - bStart;
        });
        const segmentPairs = [];
        let previousLocation = null;
        let firstLocation = null;
        let finalLocation = null;

        segmentsRaw.forEach((segment) => {
          const originLocation = extractLocationDetails(segment.OriginLines);
          const destinationLocation = extractLocationDetails(segment.DestinationLines);

          if (destinationLocation && (destinationLocation.systemId || destinationLocation.planetName || destinationLocation.planetNaturalId)) {
            finalLocation = destinationLocation;
          }

          const effectiveFrom = originLocation?.systemId
            ? originLocation
            : (previousLocation?.systemId ? previousLocation : originLocation);

          const effectiveTo = [destinationLocation, originLocation, previousLocation]
            .find((loc) => loc && loc.systemId) || null;

          if (!firstLocation && effectiveFrom?.systemId) {
            firstLocation = effectiveFrom;
          }

          if (!effectiveFrom?.systemId || !effectiveTo?.systemId || effectiveFrom.systemId === effectiveTo.systemId) {
            previousLocation = destinationLocation?.systemId ? destinationLocation : effectiveTo || previousLocation;
            return;
          }

          const fromCenter = getSystemCenter(effectiveFrom.systemId);
          const toCenter = getSystemCenter(effectiveTo.systemId);
          if (!fromCenter || !toCenter) {
            previousLocation = destinationLocation?.systemId ? destinationLocation : effectiveTo || previousLocation;
            return;
          }

          const timeBounds = getSegmentTimeBounds(segment);

          segmentPairs.push({
            fromId: effectiveFrom.systemId,
            toId: effectiveTo.systemId,
            fromCenter,
            toCenter,
            segment,
            index: segmentPairs.length,
            timeBounds,
            fromLocation: effectiveFrom,
            toLocation: effectiveTo
          });

          previousLocation = destinationLocation?.systemId ? destinationLocation : effectiveTo;
        });

        if (!firstLocation && segmentPairs.length > 0) {
          firstLocation = segmentPairs[0].fromLocation;
        }
        firstLocation = selectDisplayLocation(firstLocation, originLabelLocation);
        if (!finalLocation && segmentPairs.length > 0) {
          finalLocation = segmentPairs[segmentPairs.length - 1].toLocation;
        }
        if (!finalLocation && previousLocation?.systemId) {
          finalLocation = previousLocation;
        }
        finalLocation = selectDisplayLocation(finalLocation, destinationLabelLocation);

        segmentPairs.meta = {
          firstLocation,
          finalLocation
        };

        if (segmentPairs.length === 0) {
          flightDiagnostics.push({
            shipId: flightShipIdStr,
            shipName: ship?.Name || ship?.ShipName || flightShipIdStr || 'Unknown',
            flightId: flight?.FlightId ?? null,
            state: 'skipped-no-segments'
          });
          return;
        }

        const flightTiming = computeFlightTiming(flight, segmentPairs);
        const nowTs = Date.now();
        const timeToleranceMs = 2 * 60 * 1000;
        const arrivalMs = flightTiming.arrival;
        const departureMs = flightTiming.departure;
        const completedByTime = arrivalMs != null && arrivalMs < (nowTs - timeToleranceMs);
        const notYetDeparted = departureMs != null && departureMs > (nowTs + timeToleranceMs);

        const progressCandidates = [
          flight?.Progress,
          flight?.Completion,
          flight?.SegmentProgress,
          ship?.Progress,
          ship?.SegmentProgress,
          ship?.Completion
        ];
        const rawProgress = progressCandidates.find((value) => value != null && !Number.isNaN(Number(value)));
        const numericProgress = rawProgress != null ? Number(rawProgress) : null;
        const completedByProgress = numericProgress != null && numericProgress >= 0.999;

        const statusRaw = flight?.Status
          ?? flight?.FlightStatus
          ?? flight?.State
          ?? flight?.CurrentStatus
          ?? ship?.Status
          ?? ship?.ShipStatus
          ?? ship?.State
          ?? null;
        const statusText = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : '';
        const completedByStatus = /arriv|dock|complete|idle|done/.test(statusText);

        const isFlightActive = !notYetDeparted
          && !completedByTime
          && !completedByProgress
          && !completedByStatus
          && segmentPairs.length > 0;

        flightDiagnostics.push({
          shipId: flightShipIdStr,
          shipName: ship?.Name || ship?.ShipName || flightShipIdStr || 'Unknown',
          flightId: flight?.FlightId ?? null,
          state: isFlightActive ? 'active' : 'inactive',
          arrivalMs,
          departureMs,
          nowTs,
          progress: numericProgress,
          status: statusRaw,
          notYetDeparted,
          completedByTime,
          completedByProgress,
          completedByStatus,
          segments: segmentPairs.length
        });

        if (!isFlightActive) {
          return;
        }

        if (flightShipIdStr) {
          activeShipIds.add(flightShipIdStr);
        }

        const firstSegmentInfo = segmentPairs[0];
        const finalSegmentInfo = segmentPairs[segmentPairs.length - 1];
        const firstLocationMeta = selectDisplayLocation(
          segmentPairs.meta?.firstLocation,
          firstSegmentInfo?.fromLocation,
          originLabelLocation
        );
        const finalLocationMeta = selectDisplayLocation(
          segmentPairs.meta?.finalLocation,
          finalSegmentInfo?.toLocation,
          destinationLabelLocation
        );

        if (flight.FlightId) {
          flightSegmentsCache.set(flight.FlightId, segmentPairs);
        }
        if (flight.ShipId) {
          flightSegmentsCache.set(flight.ShipId, segmentPairs);
        }
        if (flightShipIdStr) {
          flightSegmentsCache.set(flightShipIdStr, segmentPairs);
        }

        segmentPairs.forEach((segmentInfo) => {
          const segmentKey = [segmentInfo.fromId, segmentInfo.toId].sort().join('__');
          const slot = getOffsetSlotForSegment(segmentKey);
          const offsetIndex = computeOffsetIndex(slot);
          const baseOffset = Math.max(3 / Math.max(1, zoomLevel), 1.5);

          const dx = segmentInfo.toCenter.x - segmentInfo.fromCenter.x;
          const dy = segmentInfo.toCenter.y - segmentInfo.fromCenter.y;
          const length = Math.hypot(dx, dy) || 1;
          const perpX = -dy / length;
          const perpY = dx / length;
          const offsetAmount = offsetIndex * baseOffset;

          const applyOffset = (point) => ({
            x: point.x + perpX * offsetAmount,
            y: point.y + perpY * offsetAmount
          });

          const offsetFrom = offsetAmount === 0 ? segmentInfo.fromCenter : applyOffset(segmentInfo.fromCenter);
          const offsetTo = offsetAmount === 0 ? segmentInfo.toCenter : applyOffset(segmentInfo.toCenter);

          g.append('path')
            .attr('class', 'flight-path')
            .attr('d', lineGenerator([offsetFrom, offsetTo]))
            .attr('fill', 'none')
            .attr('stroke', pathColor)
            .attr('stroke-width', Math.max(1.5 / zoomLevel, 1))
            .attr('stroke-opacity', 0.7);
        });

        // Render ship marker at interpolated position if this flight is current ship
        if (ship) {
          const segmentsForShip = flightSegmentsCache.get(flight.FlightId)
            || flightSegmentsCache.get(flight.ShipId)
            || flightSegmentsCache.get(flightShipIdStr);
          const interpolated = interpolateShipPosition(ship, segmentsForShip || segmentPairs, flight);
          if (interpolated) {
            const effectiveZoom = Math.max(1, zoomLevel);
            const radius = Math.max(6 / effectiveZoom, 3);
            const positionKey = `${Math.round(interpolated.x / 5)}:${Math.round(interpolated.y / 5)}`;
            const markerSlot = getMarkerSlot(positionKey);
            const baseSpacing = Math.max(radius * 2.1, 6 / effectiveZoom);

            let offsetX = 0;
            let offsetY = 0;
            if (markerSlot > 0) {
              if (interpolated.direction && Number.isFinite(interpolated.direction.x) && Number.isFinite(interpolated.direction.y)) {
                const perpX = -interpolated.direction.y;
                const perpY = interpolated.direction.x;
                const magnitude = Math.floor((markerSlot + 1) / 2);
                const sign = markerSlot % 2 === 1 ? 1 : -1;
                offsetX = perpX * baseSpacing * magnitude * sign;
                offsetY = perpY * baseSpacing * magnitude * sign;
              } else {
                const angle = (markerSlot - 1) * (Math.PI / 3);
                offsetX = Math.cos(angle) * baseSpacing;
                offsetY = Math.sin(angle) * baseSpacing;
              }
            }

            const markerX = interpolated.x + offsetX;
            const markerY = interpolated.y + offsetY;

            const markerGroup = g.append('g')
              .attr('class', 'ship-group')
              .attr('data-ship-id', ship.ShipId || ship.Id || ship.Name || 'unknown');

            markerGroup.raise();

            markerGroup.append('circle')
              .attr('cx', markerX)
              .attr('cy', markerY)
              .attr('r', radius)
              .attr('fill', pathColor)
              .attr('stroke', '#ffffff')
              .attr('stroke-width', Math.max(1 / effectiveZoom, 0.6))
              .attr('opacity', 0.95);

            if (interpolated.direction) {
              const arrowLength = Math.max(14 / effectiveZoom, 6);
              const arrowWidth = arrowLength * 0.65;
              const tailX = markerX + interpolated.direction.x * radius;
              const tailY = markerY + interpolated.direction.y * radius;
              const headX = tailX + interpolated.direction.x * arrowLength;
              const headY = tailY + interpolated.direction.y * arrowLength;
              const perpX = -interpolated.direction.y;
              const perpY = interpolated.direction.x;
              const halfWidth = arrowWidth / 2;
              const leftX = tailX + perpX * halfWidth;
              const leftY = tailY + perpY * halfWidth;
              const rightX = tailX - perpX * halfWidth;
              const rightY = tailY - perpY * halfWidth;

              markerGroup.append('path')
                .attr('d', `M ${headX} ${headY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`)
                .attr('fill', pathColor)
                .attr('stroke', '#000000')
                .attr('stroke-width', 0.5 / effectiveZoom)
                .attr('opacity', 0.9)
                .style('pointer-events', 'none');
            }

            const labelX = markerX + radius + (6 / effectiveZoom);
            const labelY = markerY - (radius * 0.8);
            const baseFontSize = Math.max(8 / effectiveZoom, 5.5);
            const lineHeight = Math.max(baseFontSize * 1.2, 9 / effectiveZoom);

            const shipDisplayName = ship.Name || ship.ShipName || ship.ShipId || 'Unknown';
            const preferredDestinationLocation = selectDisplayLocation(
              destinationLabelLocation,
              segmentPairs.meta?.finalLocation,
              finalLocationMeta
            );
            const destinationDisplay = formatLocationDisplay(preferredDestinationLocation);

            const statusLabel = (() => {
              if (interpolated.totalSegments > 0) {
                const onFirstSegment = interpolated.segmentIndex === 0;
                const onFinalSegment = interpolated.segmentIndex === interpolated.totalSegments - 1;
                const progress = clamp01(interpolated.progress ?? 0);
                const currentDestinationLocation = selectDisplayLocation(interpolated.toLocation, preferredDestinationLocation);
                const currentDestinationDisplay = formatLocationDisplay(currentDestinationLocation);
                const currentOriginLocation = selectDisplayLocation(interpolated.fromLocation, firstLocationMeta, originLabelLocation);
                const currentOriginDisplay = formatLocationDisplay(currentOriginLocation);

                if (onFinalSegment && progress >= 0.95) {
                  return `Arriving ${currentDestinationDisplay}`;
                }

                if (onFirstSegment && progress <= 0.05) {
                  return `Departing ${currentOriginDisplay}`;
                }

                return `In transit to ${destinationDisplay}`;
              }

              return `In transit to ${destinationDisplay}`;
            })();

            const finalArrivalEpoch = flightTiming.arrival ?? finalSegmentInfo?.timeBounds?.arrival ?? null;
            const nowTs = Date.now();
            const remainingMs = finalArrivalEpoch != null ? Math.max(0, finalArrivalEpoch - nowTs) : null;
            const timeRemainingText = remainingMs != null ? formatDuration(remainingMs) : 'Unknown';
            const etaText = finalArrivalEpoch != null ? formatEpoch(finalArrivalEpoch) : 'Unknown';

            const label = markerGroup.append('text')
              .attr('x', labelX)
              .attr('y', labelY)
              .attr('fill', '#ffffff')
              .attr('font-size', `${baseFontSize}px`)
              .attr('font-weight', 600)
              .attr('stroke', '#000000')
              .attr('stroke-width', 1 / Math.max(1, effectiveZoom * 2))
              .attr('paint-order', 'stroke')
              .attr('text-anchor', 'start')
              .attr('dominant-baseline', 'hanging')
              .attr('opacity', 0.95);

            const labelPaddingX = Math.max(6 / effectiveZoom, 3);
            const labelPaddingY = Math.max(3 / effectiveZoom, 1.5);
            const labelCornerRadius = Math.max(4 / effectiveZoom, 2);
            const labelBackground = markerGroup.insert('rect', 'text')
              .attr('class', 'ship-label-background')
              .attr('fill', 'rgba(15, 23, 42, 0.85)')
              .attr('stroke', '#000000')
              .attr('stroke-width', 0.5 / effectiveZoom)
              .attr('rx', labelCornerRadius)
              .attr('ry', labelCornerRadius)
              .attr('opacity', 0.95)
              .style('pointer-events', 'none')
              .style('display', 'none');

            const updateLabelBackground = () => {
              const labelNode = label.node();
              if (!labelNode) return;
              const bbox = labelNode.getBBox();
              if (!bbox || (bbox.width === 0 && bbox.height === 0)) return;
              labelBackground
                .attr('x', bbox.x - labelPaddingX)
                .attr('y', bbox.y - labelPaddingY)
                .attr('width', bbox.width + (labelPaddingX * 2))
                .attr('height', bbox.height + (labelPaddingY * 2));
            };

            label.append('tspan')
              .attr('x', labelX)
              .attr('dy', 0)
              .style('font-size', `${baseFontSize * 1.25}px`)
              .attr('font-weight', 700)
              .text(shipDisplayName);

            const statusTspan = label.append('tspan')
              .attr('x', labelX)
              .attr('dy', `${lineHeight}px`)
              .attr('fill', '#facc15')
              .attr('font-weight', 600)
              .style('font-size', `${baseFontSize * 1.05}px`)
              .style('display', 'none')
              .text(statusLabel);

            const remainingTspan = label.append('tspan')
              .attr('x', labelX)
              .attr('dy', `${lineHeight}px`)
              .attr('fill', '#d1d5db')
              .attr('font-weight', 400)
              .style('display', 'none')
              .text(`Time Remaining: ${timeRemainingText}`);

            const etaTspan = label.append('tspan')
              .attr('x', labelX)
              .attr('dy', `${lineHeight}px`)
              .attr('fill', '#d1d5db')
              .attr('font-weight', 400)
              .style('display', 'none')
              .text(`ETA: ${etaText}`);

            const infoSpans = [statusTspan, remainingTspan, etaTspan];

            const showInfo = () => {
              markerGroup.raise();
              infoSpans.forEach((span) => span.style('display', null));
              labelBackground.style('display', null);
              updateLabelBackground();
            };

            const hideInfo = () => {
              infoSpans.forEach((span) => span.style('display', 'none'));
              labelBackground.style('display', 'none');
            };

            markerGroup
              .on('mouseover.shipinfo', () => {
                showInfo();
              })
              .on('mouseout.shipinfo', (event) => {
                const related = event.relatedTarget;
                const groupNode = markerGroup.node();
                if (related && groupNode && groupNode.contains(related)) {
                  return;
                }
                hideInfo();
              });
          }
        }
      });
    }

    if (flightDiagnostics.length > 0) {
      // eslint-disable-next-line no-console
      console.debug('[idle-debug][flight-evaluation]', flightDiagnostics);
    }

    if (activeShipIds.size > 0) {
      // eslint-disable-next-line no-console
      console.debug('[idle-debug][active-ship-ids]', Array.from(activeShipIds));
    }

    if (graph && (ships?.length > 0 || flights?.length > 0)) {
      (ships || []).forEach((ship) => {
        const shipKey = ship?.ShipId || ship?.Id || ship?.Ship || ship?.Registration || ship?.Name;
        if (!shipKey) {
          return;
        }

        const shipIdStr = String(shipKey);
        if (selectedShipId !== '__all__' && shipIdStr !== selectedShipId) {
          return;
        }

        if (activeShipIds.has(shipIdStr)) {
          // eslint-disable-next-line no-console
          console.debug('[idle-debug][skip-active]', {
            ship: describeShip(ship),
            shipId: shipIdStr
          });
          return;
        }

        const locationSystemId = getShipLocationSystemId(ship);
        const idleLocationDetails = getShipLocationDetails(ship, locationSystemId);
        const effectiveSystemId = idleLocationDetails?.systemId || locationSystemId;
        if (!effectiveSystemId) {
          // eslint-disable-next-line no-console
          console.debug('[idle-debug][skip-no-system]', {
            ship: describeShip(ship),
            shipId: shipIdStr,
            locationSystemId,
            idleLocationDetails
          });
          return;
        }

        const systemCenter = getSystemCenter(effectiveSystemId);
        if (!systemCenter) {
          // eslint-disable-next-line no-console
          console.debug('[idle-debug][skip-no-center]', {
            ship: describeShip(ship),
            shipId: shipIdStr,
            effectiveSystemId,
            idleLocationDetails
          });
          return;
        }

        const effectiveZoom = Math.max(1, zoomLevel);
        const radius = Math.max(6 / effectiveZoom, 3);
        const positionKey = `${Math.round(systemCenter.x / 5)}:${Math.round(systemCenter.y / 5)}`;
        const markerSlot = getMarkerSlot(positionKey);
        const baseSpacing = Math.max(radius * 2.1, 6 / effectiveZoom);

        let offsetX = 0;
        let offsetY = 0;
        if (markerSlot > 0) {
          const angle = (markerSlot - 1) * (Math.PI / 3);
          offsetX = Math.cos(angle) * baseSpacing;
          offsetY = Math.sin(angle) * baseSpacing;
        }

        const markerX = systemCenter.x + offsetX;
        const markerY = systemCenter.y + offsetY;
        const pathColor = getShipColor(ship);
        const locationName = formatLocationDisplay(idleLocationDetails)
          || systemNames[effectiveSystemId]
          || effectiveSystemId
          || 'Unknown';
        const shipDisplayName = ship.Name || ship.ShipName || ship.ShipId || 'Unknown';
        // eslint-disable-next-line no-console
        console.debug('[idle-debug][render-idle]', {
          ship: describeShip(ship),
          shipId: shipIdStr,
          effectiveSystemId,
          locationSystemId,
          locationName
        });
        const statusLabel = `Idle at ${locationName}`;
        const timeRemainingText = '—';
        const etaText = '—';

        const markerGroup = g.append('g')
          .attr('class', 'ship-group idle-ship-group')
          .attr('data-ship-id', shipIdStr);

        markerGroup.raise();

        markerGroup.append('circle')
          .attr('cx', markerX)
          .attr('cy', markerY)
          .attr('r', radius)
          .attr('fill', pathColor)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', Math.max(1 / effectiveZoom, 0.6))
          .attr('opacity', 0.95);

        const labelX = markerX + radius + (6 / effectiveZoom);
        const labelY = markerY - (radius * 0.8);
        const baseFontSize = Math.max(8 / effectiveZoom, 5.5);
        const lineHeight = Math.max(baseFontSize * 1.2, 9 / effectiveZoom);

        const label = markerGroup.append('text')
          .attr('x', labelX)
          .attr('y', labelY)
          .attr('fill', '#ffffff')
          .attr('font-size', `${baseFontSize}px`)
          .attr('font-weight', 600)
          .attr('stroke', '#000000')
          .attr('stroke-width', 1 / Math.max(1, effectiveZoom * 2))
          .attr('paint-order', 'stroke')
          .attr('text-anchor', 'start')
          .attr('dominant-baseline', 'hanging')
          .attr('opacity', 0.95);

        const labelPaddingX = Math.max(6 / effectiveZoom, 3);
        const labelPaddingY = Math.max(3 / effectiveZoom, 1.5);
        const labelCornerRadius = Math.max(4 / effectiveZoom, 2);
        const labelBackground = markerGroup.insert('rect', 'text')
          .attr('class', 'ship-label-background')
          .attr('fill', 'rgba(15, 23, 42, 0.85)')
          .attr('stroke', '#000000')
          .attr('stroke-width', 0.5 / effectiveZoom)
          .attr('rx', labelCornerRadius)
          .attr('ry', labelCornerRadius)
          .attr('opacity', 0.95)
          .style('pointer-events', 'none')
          .style('display', 'none');

        const updateLabelBackground = () => {
          const labelNode = label.node();
          if (!labelNode) return;
          const bbox = labelNode.getBBox();
          if (!bbox || (bbox.width === 0 && bbox.height === 0)) return;
          labelBackground
            .attr('x', bbox.x - labelPaddingX)
            .attr('y', bbox.y - labelPaddingY)
            .attr('width', bbox.width + (labelPaddingX * 2))
            .attr('height', bbox.height + (labelPaddingY * 2));
        };

        label.append('tspan')
          .attr('x', labelX)
          .attr('dy', 0)
          .style('font-size', `${baseFontSize * 1.25}px`)
          .attr('font-weight', 700)
          .text(shipDisplayName);

        const statusTspan = label.append('tspan')
          .attr('x', labelX)
          .attr('dy', `${lineHeight}px`)
          .attr('fill', '#facc15')
          .attr('font-weight', 600)
          .style('font-size', `${baseFontSize * 1.05}px`)
          .style('display', 'none')
          .text(statusLabel);

        const remainingTspan = label.append('tspan')
          .attr('x', labelX)
          .attr('dy', `${lineHeight}px`)
          .attr('fill', '#d1d5db')
          .attr('font-weight', 400)
          .style('display', 'none')
          .text(`Time Remaining: ${timeRemainingText}`);

        const etaTspan = label.append('tspan')
          .attr('x', labelX)
          .attr('dy', `${lineHeight}px`)
          .attr('fill', '#d1d5db')
          .attr('font-weight', 400)
          .style('display', 'none')
          .text(`ETA: ${etaText}`);

        const infoSpans = [statusTspan, remainingTspan, etaTspan];

        const showInfo = () => {
          markerGroup.raise();
          infoSpans.forEach((span) => span.style('display', null));
          labelBackground.style('display', null);
          updateLabelBackground();
        };

        const hideInfo = () => {
          infoSpans.forEach((span) => span.style('display', 'none'));
          labelBackground.style('display', 'none');
        };

        markerGroup
          .on('mouseover.shipinfo', () => {
            showInfo();
          })
          .on('mouseout.shipinfo', (event) => {
            const related = event.relatedTarget;
            const groupNode = markerGroup.node();
            if (related && groupNode && groupNode.contains(related)) {
              return;
            }
            hideInfo();
          });
      });
    }

    if (!isOverlayVisible || isLoading || error) {
      return;
    }

    // Color scales for both metrics
    const densityColorScale = d3.scaleSequential()
      .domain([0, maxValues.density])
      .interpolator(d3.interpolatePuBu);

    const luminosityColorScale = d3.scaleSequential()
      .domain([0, maxValues.luminosity])
      .interpolator(d3.interpolateWarm);

    g.selectAll('rect:not(.meteor-density-bar)').each(function () {
      const node = d3.select(this);
      const systemId = node.attr('id');

      if (systemId === 'rect1') return;

      const density = meteorDensityData[systemId] || 0;
      const luminosity = luminosityData[systemId] || 0;

      const nodeWidth = parseFloat(node.attr('width'));
      const nodeHeight = parseFloat(node.attr('height'));
      const nodeX = parseFloat(node.attr('x'));
      const nodeY = parseFloat(node.attr('y'));

      const systemGroup = g.append('g')
        .attr('class', 'meteor-density-group');

      // Calculate bar dimensions
      const barWidth = Math.max(3, nodeWidth * 0.2 / zoomLevel);
      const maxBarHeight = nodeHeight;
      const barSpacing = barWidth * 0.5;

      // Create log scale for luminosity bar height
      const luminosityLogScale = d3.scaleLog()
        .domain([0.01, maxValues.luminosity])
        .range([0, maxBarHeight]);

      // Density bar
      const densityHeight = maxBarHeight * (density / maxValues.density);
      const densityX = nodeX + nodeWidth * 1.2;

      // Background for density bar
      systemGroup.append('rect')
        .attr('class', 'meteor-density-bar-background data-overlay')
        .attr('x', densityX)
        .attr('y', nodeY)
        .attr('width', barWidth)
        .attr('height', maxBarHeight)
        .attr('fill', '#2a2a2a')
        .attr('opacity', 0.5);

      // Density bar
      const densityBar = systemGroup.append('rect')
        .attr('class', 'meteor-density-bar data-overlay')
        .attr('x', densityX)
        .attr('y', nodeY + maxBarHeight - densityHeight)
        .attr('width', barWidth)
        .attr('height', densityHeight)
        .attr('fill', densityColorScale(density))
        .attr('opacity', 0.8);

      // Luminosity bar
      const luminosityHeight = luminosityLogScale(Math.max(0.1, luminosity));
      const luminosityX = densityX + barWidth + barSpacing;

      // Background for luminosity bar
      systemGroup.append('rect')
        .attr('class', 'luminosity-bar-background data-overlay')
        .attr('x', luminosityX)
        .attr('y', nodeY)
        .attr('width', barWidth)
        .attr('height', maxBarHeight)
        .attr('fill', '#2a2a2a')
        .attr('opacity', 0.5);

      // Luminosity bar
      const luminosityBar = systemGroup.append('rect')
        .attr('class', 'luminosity-bar data-overlay')
        .attr('x', luminosityX)
        .attr('y', nodeY + maxBarHeight - luminosityHeight)
        .attr('width', barWidth)
        .attr('height', luminosityHeight)
        .attr('fill', luminosityColorScale(luminosity))
        .attr('opacity', 0.8);

      // System name label
      systemGroup.append('text')
        .attr('class', 'system-name-label data-overlay')
        .attr('x', nodeX + (nodeWidth / 2))
        .attr('y', nodeY + nodeHeight + 2)
        .attr('fill', '#CCCCCC')
        .attr('stroke', '#000000')
        .attr('stroke-width', 1 / zoomLevel)
        .attr('paint-order', 'stroke')
        .attr('font-size', '6px')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'hanging')
        .style('pointer-events', 'none')
        .text(systemNames[systemId] || systemId);

      const addBarHoverEffects = (bar, dataType, value, colorScale) => {
        bar.on('mouseover.data', function (event) {
          event.stopPropagation();
          d3.select(this)
            .attr('opacity', 1)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1 / zoomLevel);

          d3.select('body')
            .append('div')
            .attr('class', 'data-overlay-tooltip')
            .style('position', 'absolute')
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 10}px`)
            .style('background-color', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '5px')
            .style('border-radius', '4px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .html([
              '<div style="background: rgba(0,0,0,0.9); padding: 8px; border-radius: 4px; border: 1px solid #444">',
              `  <div style="font-weight: bold; color: #f7a600; margin-bottom: 4px">${systemNames[systemId] || systemId}</div>`,
              `  <div>${dataType}: ${value.toFixed(3)}</div>`,
              '  <div style="color: #aaa; font-size: 11px; margin-top: 2px">',
              `    Relative to Max (${maxValues[dataType.toLowerCase()].toFixed(2)}):`,
              `    ${((value / maxValues[dataType.toLowerCase()]) * 100).toFixed(1)}%`,
              '  </div>',
              '</div>'
            ].join(''));
        })
          .on('mouseout.data', function (event) {
            event.stopPropagation();
            d3.select(this)
              .attr('opacity', 0.8)
              .attr('stroke', 'none');
            d3.selectAll('.data-overlay-tooltip').remove();
          });
      };

      addBarHoverEffects(densityBar, 'Density', density, densityColorScale);
      addBarHoverEffects(luminosityBar, 'Luminosity', luminosity, luminosityColorScale);
    });
  }, [mapRef, isOverlayVisible, isLoading, error, meteorDensityData, luminosityData, systemNames, maxValues, ships, flights, graph, selectedShipId, planetLookups, systemLookups]);

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay]);

  useEffect(() => {
    if (!mapRef?.current?.svg) return;

    // Capture the current svg reference
    const svg = mapRef.current.svg;

    const handleZoom = () => {
      renderOverlay();
    };

    svg.on('zoom.overlay', handleZoom);

    return () => {
      // Use the captured reference in cleanup
      svg.on('zoom.overlay', null);
    };
  }, [mapRef, renderOverlay]);

  return (
    <div
      className="ship-filter-control"
      style={{
        position: 'absolute',
        top: '12px',
        right: '16px',
        zIndex: 10,
        background: 'rgba(0, 0, 0, 0.65)',
        color: '#f5f5f5',
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        fontSize: '12px',
        lineHeight: 1.4
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '11px' }}>Ship Filter</span>
        <select
          value={selectedShipId}
          onChange={handleShipChange}
          style={{
            background: '#1f2933',
            color: '#f5f5f5',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '12px',
            outline: 'none'
          }}
        >
          {shipOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default React.memo(DataPointOverlay);