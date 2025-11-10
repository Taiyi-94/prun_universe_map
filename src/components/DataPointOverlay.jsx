import React, { useEffect, useCallback, useContext, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { useDataPoints } from '../contexts/DataPointContext';
import { GraphContext } from '../contexts/GraphContext';

const STORAGE_PERCENT_FIELDS = [
  'PercentFull',
  'percentFull',
  'FillPercent',
  'FillPercentage',
  'Utilization',
  'UsagePercent'
];

const SHIP_PERCENT_FIELDS = [
  'CargoPercentFull',
  'StoragePercentFull',
  'CargoUsage',
  'CargoUtilization',
  'LoadPercent',
  'CapacityPercent'
];

const STORAGE_WEIGHT_CAPACITY_FIELDS = [
  'WeightCapacity',
];

const STORAGE_VOLUME_CAPACITY_FIELDS = [
  'VolumeCapacity',
];

const STORAGE_WEIGHT_LOAD_FIELDS = [
  'WeightLoad',
];

const STORAGE_VOLUME_LOAD_FIELDS = [
  'VolumeLoad',
];

const SHIP_CAPACITY_PROFILES = [
  {
    key: 'weight3000_volume1000',
    weight: 3000,
    volume: 1000,
    color: '#f91616ff',
    label: 'Wt 3000 / Vol 1000'
  },
  {
    key: 'weight1000_volume3000',
    weight: 1000,
    volume: 3000,
    color: '#00eeffff',
    label: 'Wt 1000 / Vol 3000'
  },
  {
    key: 'capacity100',
    weight: 100,
    volume: 100,
    color: '#367cffff',
    label: '100 / 100'
  },
  {
    key: 'capacity500',
    weight: 500,
    volume: 500,
    color: '#019514ff',
    label: '500 / 500'
  },
  {
    key: 'capacity1000',
    weight: 1000,
    volume: 1000,
    color: '#fffb00ff',
    label: '1000 / 1000'
  },
  {
    key: 'capacity2000',
    weight: 2000,
    volume: 2000,
    color: '#ea8c08ff',
    label: '2000 / 2000'
  },
  {
    key: 'capacity5000',
    weight: 5000,
    volume: 5000,
    color: '#d35cffff',
    label: '5000 / 5000'
  }
];

const normalizeLookupKey = (value) => {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.toLowerCase();
};

const toNumericValue = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) {
      return null;
    }

    const numericMatch = normalized.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!numericMatch) {
      return null;
    }

    const parsed = Number(numericMatch[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return null;
};

const normalizeDeliveryShipmentType = (value) => {
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const collapsed = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (collapsed === 'DELIVERYSHIPMENT' || collapsed === 'DELIVERSHIPMENT') {
    return 'DELIVERY_SHIPMENT';
  }

  return null;
};

const isDeliveryShipmentType = (value) => normalizeDeliveryShipmentType(value) != null;

const pickNumericValue = (source, fields) => {
  if (!source || typeof source !== 'object') return null;
  for (const field of fields) {
    if (field in source) {
      const numeric = toNumericValue(source[field]);
      if (numeric != null) {
        return numeric;
      }
    }
  }
  return null;
};

const storageRecordScoreCache = new WeakMap();

const evaluateStorageRecord = (record) => {
  if (!record || typeof record !== 'object') {
    return { score: -Infinity, timestamp: -Infinity };
  }

  if (storageRecordScoreCache.has(record)) {
    return storageRecordScoreCache.get(record);
  }

  const rawType = typeof record.Type === 'string' ? record.Type.toLowerCase() : '';
  const normalizedType = rawType.replace(/[^a-z]/g, '');

  let score = 0;

  if (normalizedType.includes('shipstore')) {
    score += 300;
  } else if (normalizedType.includes('ship') && normalizedType.includes('store')) {
    score += 240;
  } else if (normalizedType.includes('ship')) {
    score += 180;
  } else if (normalizedType.includes('ftlfuel')) {
    score += 90;
  } else if (normalizedType.includes('stlfuel')) {
    score += 80;
  } else if (normalizedType.includes('store')) {
    score += 60;
  }

  if (record.FixedStore === false) {
    score += 25;
  }

  if (pickNumericValue(record, STORAGE_WEIGHT_CAPACITY_FIELDS) != null) {
    score += 40;
  }

  if (pickNumericValue(record, STORAGE_VOLUME_CAPACITY_FIELDS) != null) {
    score += 40;
  }

  if (pickNumericValue(record, STORAGE_WEIGHT_LOAD_FIELDS) != null) {
    score += 20;
  }

  if (pickNumericValue(record, STORAGE_VOLUME_LOAD_FIELDS) != null) {
    score += 20;
  }

  if (record.Name) {
    score += 5;
  }

  const timestampRaw = record.Timestamp
    || record.timestamp
    || record.LastUpdated
    || record.lastUpdated
    || record.UpdatedAt
    || record.updatedAt
    || null;
  const timestampValue = typeof timestampRaw === 'string' || typeof timestampRaw === 'number'
    ? Date.parse(timestampRaw)
    : Number.NaN;

  const evaluation = {
    score,
    timestamp: Number.isFinite(timestampValue) ? timestampValue : -Infinity
  };

  storageRecordScoreCache.set(record, evaluation);
  return evaluation;
};

const pickPreferredStorageRecord = (existing, candidate) => {
  if (!candidate) {
    return existing || null;
  }

  if (!existing) {
    return candidate;
  }

  if (existing === candidate) {
    return existing;
  }

  const existingEval = evaluateStorageRecord(existing);
  const candidateEval = evaluateStorageRecord(candidate);

  if (candidateEval.score > existingEval.score) {
    return candidate;
  }

  if (candidateEval.score < existingEval.score) {
    return existing;
  }

  if (candidateEval.timestamp > existingEval.timestamp) {
    return candidate;
  }

  if (candidateEval.timestamp < existingEval.timestamp) {
    return existing;
  }

  return existing;
};

const DataPointOverlay = ({ mapRef }) => {
  const {
    meteorDensityData,
    luminosityData,
    systemNames,
    isOverlayVisible,
    isLoading,
    error,
    maxValues,
    showShipLabels,
    toggleShipLabels
  } = useDataPoints();
  const {
    graph,
    ships,
    flights,
    planetData,
    universeData,
    storageData,
    contracts,
    stationData
  } = useContext(GraphContext);
  const [selectedShipId, setSelectedShipId] = useState('__all__');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [isShipFilterCollapsed, setIsShipFilterCollapsed] = useState(false);
  const labelsEnabled = Boolean(showShipLabels);

  const loadColorScale = useMemo(() => (
    d3.scaleLinear()
      .domain([0, 0.5, 0.85, 1, 1.1])
      .range(['#10b981', '#84cc16', '#facc15', '#f97316', '#ef4444'])
      .clamp(true)
  ), []);

  const storageIndex = useMemo(() => {
    const index = new Map();
    (storageData || []).forEach((record) => {
      if (!record || typeof record !== 'object') {
        return;
      }

      const candidateKeys = [
        record.StorageId,
        record.StorageID,
        record.StorageNaturalId,
        record.StorageNaturalID,
        record.StorageName,
        record.StorageLabel,
        record.AddressableId,
        record.AddressableID,
        record.AddressId,
        record.AddressID,
        record.Id,
        record.ID,
        record.Name,
        record.NaturalId,
        record.NaturalID,
        record.LocationId,
        record.OwnerId
      ];

      candidateKeys.forEach((candidate) => {
        const normalized = normalizeLookupKey(candidate);
        if (normalized) {
          const existing = index.get(normalized);
          const preferred = pickPreferredStorageRecord(existing, record);
          if (preferred && (!existing || preferred !== existing)) {
            index.set(normalized, preferred);
          }
        }
      });
    });
    return index;
  }, [storageData]);

  const shipmentContractsByItemId = useMemo(() => {
    const map = new Map();

    const normalizeTimestamp = (value) => {
      if (value == null) return null;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    (contracts || []).forEach((contract) => {
      if (!contract || typeof contract !== 'object') {
        return;
      }

      const rawContractType = contract.Type || contract.type || null;

      const contractId = contract.ContractId || contract.contractId || null;
      const contractLocalId = contract.ContractLocalId
        || contract.ContractNumber
        || contract.ContractCode
        || contract.contractLocalId
        || contract.contractNumber
        || contract.contractCode
        || null;
      const contractStatus = contract.Status || contract.status || null;
      const partnerName = contract.PartnerName || contract.partnerName || null;
      const partnerCode = contract.PartnerCompanyCode || contract.partnerCompanyCode || null;
      const dueDateEpochMs = toNumericValue(contract.DueDateEpochMs ?? contract.dueDateEpochMs);
      const contractTimestamp = normalizeTimestamp(contract.Timestamp ?? contract.timestamp);

      const conditions = Array.isArray(contract.Conditions)
        ? contract.Conditions
        : (Array.isArray(contract.conditions) ? contract.conditions : []);

      const normalizedContractType = normalizeDeliveryShipmentType(rawContractType);

      const hasDeliveryShipmentCondition = conditions.some((condition) => {
        if (!condition || typeof condition !== 'object') {
          return false;
        }
        return isDeliveryShipmentType(condition.Type || condition.type);
      });

      if (!normalizedContractType && !hasDeliveryShipmentCondition) {
        return;
      }

      conditions.forEach((condition) => {
        if (!condition || typeof condition !== 'object') {
          return;
        }

        const rawConditionType = condition.Type || condition.type || null;
        const normalizedConditionType = normalizeDeliveryShipmentType(rawConditionType);
        if (!normalizedConditionType) {
          return;
        }

        const rawShipmentItemId = condition.ShipmentItemId
          || condition.ShipmentItemID
          || condition.MaterialId
          || condition.MaterialID
          || null;
        const normalizedShipmentItemId = normalizeLookupKey(rawShipmentItemId);
        if (!normalizedShipmentItemId) {
          return;
        }

        const conditionEntry = {
          contractId,
          contractLocalId,
          contractStatus,
          partnerName,
          partnerCode,
          contractType: normalizedContractType ?? (typeof rawContractType === 'string' ? rawContractType : null),
          contractTypeNormalized: normalizedContractType,
          dueDateEpochMs: dueDateEpochMs != null ? dueDateEpochMs : null,
          timestampEpochMs: contractTimestamp,
          conditionId: condition.ConditionId || condition.conditionId || null,
          conditionType: normalizedConditionType,
          conditionTypeRaw: typeof rawConditionType === 'string' ? rawConditionType : null,
          conditionStatus: condition.Status || condition.status || null,
          conditionIndex: toNumericValue(condition.ConditionIndex ?? condition.conditionIndex),
          destination: condition.Destination || condition.destination || null,
          party: condition.Party || condition.party || null,
          weight: toNumericValue(condition.Weight ?? condition.weight),
          volume: toNumericValue(condition.Volume ?? condition.volume),
          deadlineEpochMs: toNumericValue(condition.DeadlineEpochMs ?? condition.deadlineEpochMs),
          dependencies: Array.isArray(condition.Dependencies)
            ? condition.Dependencies
            : (Array.isArray(condition.dependencies) ? condition.dependencies : []),
          condition
        };

        const existingEntries = map.get(normalizedShipmentItemId);
        if (existingEntries) {
          existingEntries.push(conditionEntry);
        } else {
          map.set(normalizedShipmentItemId, [conditionEntry]);
        }
      });
    });

    map.forEach((entries) => {
      entries.sort((a, b) => {
        const indexA = Number.isFinite(a.conditionIndex) ? a.conditionIndex : Number.POSITIVE_INFINITY;
        const indexB = Number.isFinite(b.conditionIndex) ? b.conditionIndex : Number.POSITIVE_INFINITY;
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        const typeA = (a.conditionType || '').toString();
        const typeB = (b.conditionType || '').toString();
        return typeA.localeCompare(typeB);
      });

    });

    return map;
  }, [contracts]);

  const shipLoadInfo = useMemo(() => {
    const map = new Map();

    const normalizePercent = (value) => {
      if (value == null) return null;
      const numeric = toNumericValue(value);
      if (numeric == null) return null;
      if (numeric > 1.5) {
        return numeric / 100;
      }
      return numeric;
    };

    const considerShip = (ship) => {
      if (!ship || typeof ship !== 'object') {
        return;
      }

      const shipIdCandidates = [
        ship.ShipId,
        ship.Id,
        ship.Ship,
        ship.Registration,
        ship.Name,
        ship.ShipName,
        ship.DisplayName,
        ship.AddressableId,
        ship.AddressId,
        ship.StorageAddressableId
      ];

      const storageCandidates = [
        ship.StorageId,
        ship.StorageID,
        ship.StorageNaturalId,
        ship.StorageNaturalID,
        ship.StorageName,
        ship.CurrentStorageId,
        ship.CurrentStorageID,
        ship.CurrentStorage?.StorageId,
        ship.CurrentStorage?.StorageID,
        ship.CurrentStorage?.Id,
        ship.CurrentStorage?.Name,
        ship.Storage?.StorageId,
        ship.Storage?.StorageID,
        ship.Storage?.Id,
        ship.Storage?.Name,
        ship.Storage?.StorageNaturalId,
        ship.Storage?.StorageNaturalID,
        ship.Storage?.NaturalId,
        ship.Storage?.AddressableId,
        ship.Storage?.AddressableID,
        ship.CurrentStorage?.StorageId,
        ship.CurrentStorage?.StorageID,
        ship.CurrentStorage?.Id,
        ship.CurrentStorage?.Name,
        ship.CurrentStorage?.StorageNaturalId,
        ship.CurrentStorage?.StorageNaturalID,
        ship.CurrentStorage?.NaturalId,
        ship.CurrentStorage?.AddressableId,
        ship.CurrentStorage?.AddressableID
      ];

      const allLookupCandidates = [...shipIdCandidates, ...storageCandidates];

      let storageRecord = null;
      let storageRecordEval = null;

      for (const candidate of allLookupCandidates) {
        const normalized = normalizeLookupKey(candidate);
        if (!normalized) {
          continue;
        }
        const candidateRecord = storageIndex.get(normalized);
        if (!candidateRecord) {
          continue;
        }

        const evaluation = evaluateStorageRecord(candidateRecord);
        if (!storageRecordEval
          || evaluation.score > storageRecordEval.score
          || (evaluation.score === storageRecordEval.score && evaluation.timestamp > storageRecordEval.timestamp)) {
          storageRecord = candidateRecord;
          storageRecordEval = evaluation;
        }
      }

      const shipStorageSource = ship.Storage && typeof ship.Storage === 'object' ? ship.Storage : null;

      const shipments = [];
      const seenShipmentKeys = new Set();

      const collectShipmentsFromRecord = (record) => {
        if (!record || typeof record !== 'object') {
          return;
        }

        const items = Array.isArray(record.StorageItems)
          ? record.StorageItems
          : (Array.isArray(record.Items) ? record.Items : []);

        items.forEach((item, index) => {
          if (!item || typeof item !== 'object') {
            return;
          }

          const candidateIds = [
            item.ShipmentItemId,
            item.ShipmentItemID,
            item.MaterialId,
            item.MaterialID,
            item.ItemId,
            item.ItemID,
            item.Id,
            item.ID
          ];

          let matchedKey = null;
          let matchedContracts = null;

          for (const candidateId of candidateIds) {
            const normalizedCandidate = normalizeLookupKey(candidateId);
            if (!normalizedCandidate) {
              continue;
            }
            if (shipmentContractsByItemId.has(normalizedCandidate)) {
              matchedKey = normalizedCandidate;
              matchedContracts = shipmentContractsByItemId.get(normalizedCandidate).map((entry) => ({
                ...entry
              }));
              break;
            }
          }

          const dedupeKey = matchedKey
            || normalizeLookupKey(item.MaterialId)
            || normalizeLookupKey(item.ShipmentItemId)
            || `${normalizeLookupKey(record.StorageId || record.Id || record.Name || 'record')}::${index}`;

          if (dedupeKey && seenShipmentKeys.has(dedupeKey)) {
            return;
          }

          const itemTypeRaw = typeof item.Type === 'string' ? item.Type.toLowerCase() : '';
          const isLikelyShipment = itemTypeRaw.includes('shipment');

          if (!matchedContracts && !isLikelyShipment) {
            return;
          }

          if (dedupeKey) {
            seenShipmentKeys.add(dedupeKey);
          }

          shipments.push({
            storageItem: item,
            shipmentItemKey: matchedKey,
            contractMatches: matchedContracts || [],
            source: {
              storageId: record.StorageId || record.Id || null,
              name: record.Name || record.StorageName || null,
              type: record.Type || null
            }
          });
        });
      };

      const volumeCapacitySources = [storageRecord, shipStorageSource, ship];
      const weightCapacitySources = [storageRecord, shipStorageSource, ship];
      const volumeLoadSources = [storageRecord, shipStorageSource, ship];
      const weightLoadSources = [storageRecord, shipStorageSource, ship];

      const pickFromSources = (sources, fields) => {
        for (const source of sources) {
          const value = pickNumericValue(source, fields);
          if (value != null) {
            return value;
          }
        }
        return null;
      };

      const volumeCapacity = pickFromSources(volumeCapacitySources, STORAGE_VOLUME_CAPACITY_FIELDS)
        ?? pickFromSources([ship], STORAGE_VOLUME_CAPACITY_FIELDS);
      const weightCapacity = pickFromSources(weightCapacitySources, STORAGE_WEIGHT_CAPACITY_FIELDS)
        ?? pickFromSources([ship], STORAGE_WEIGHT_CAPACITY_FIELDS);

      const volumeLoad = pickFromSources(volumeLoadSources, STORAGE_VOLUME_LOAD_FIELDS)
        ?? pickFromSources([ship], STORAGE_VOLUME_LOAD_FIELDS);
      const weightLoad = pickFromSources(weightLoadSources, STORAGE_WEIGHT_LOAD_FIELDS)
        ?? pickFromSources([ship], STORAGE_WEIGHT_LOAD_FIELDS);

      const percentSources = [storageRecord, shipStorageSource, ship];
      const generalPercent = pickFromSources(percentSources, STORAGE_PERCENT_FIELDS)
        ?? pickFromSources([ship], SHIP_PERCENT_FIELDS);

      const volumeRatio = (() => {
        if (volumeCapacity != null && Number.isFinite(volumeCapacity) && volumeCapacity > 0 && volumeLoad != null) {
          return Math.max(0, volumeLoad / volumeCapacity);
        }
        return null;
      })();

      const weightRatio = (() => {
        if (weightCapacity != null && Number.isFinite(weightCapacity) && weightCapacity > 0 && weightLoad != null) {
          return Math.max(0, weightLoad / weightCapacity);
        }
        return null;
      })();

      const percentRatio = normalizePercent(generalPercent);

      const ratioCandidates = [volumeRatio, weightRatio, percentRatio].filter((value) => value != null && Number.isFinite(value));
      const ratio = ratioCandidates.length > 0 ? Math.max(...ratioCandidates) : null;

      const normalizedVolumeCapacity = Number.isFinite(volumeCapacity) ? volumeCapacity : null;
      const normalizedWeightCapacity = Number.isFinite(weightCapacity) ? weightCapacity : null;
      const normalizedVolumeLoad = Number.isFinite(volumeLoad) ? volumeLoad : null;
      const normalizedWeightLoad = Number.isFinite(weightLoad) ? weightLoad : null;

      collectShipmentsFromRecord(storageRecord);
      collectShipmentsFromRecord(shipStorageSource);

      if (!storageRecord
        && normalizedVolumeCapacity == null
        && normalizedWeightCapacity == null
        && normalizedVolumeLoad == null
        && normalizedWeightLoad == null
        && ratio == null
        && shipments.length === 0) {
        return;
      }

      const derivedVolumeLoad = normalizedVolumeLoad != null
        ? normalizedVolumeLoad
        : (normalizedVolumeCapacity != null && volumeRatio != null
          ? volumeRatio * normalizedVolumeCapacity
          : null);

      const derivedWeightLoad = normalizedWeightLoad != null
        ? normalizedWeightLoad
        : (normalizedWeightCapacity != null && weightRatio != null
          ? weightRatio * normalizedWeightCapacity
          : null);

      const info = {
        storageRecord,
        volumeCapacity: normalizedVolumeCapacity,
        weightCapacity: normalizedWeightCapacity,
        volumeLoad: derivedVolumeLoad,
        weightLoad: derivedWeightLoad,
        volumeRatio: volumeRatio != null ? Math.max(0, volumeRatio) : null,
        weightRatio: weightRatio != null ? Math.max(0, weightRatio) : null,
        ratio: ratio != null ? Math.max(0, ratio) : null,
        shipments
      };

      allLookupCandidates.forEach((candidate) => {
        const normalized = normalizeLookupKey(candidate);
        if (normalized && !map.has(normalized)) {
          map.set(normalized, info);
        }
      });
    };

    (ships || []).forEach(considerShip);

    return map;
  }, [ships, storageIndex, shipmentContractsByItemId]);

  const normalizedPartnerFilter = useMemo(() => normalizeLookupKey(partnerFilter) || '', [partnerFilter]);
  const partnerFilterActive = normalizedPartnerFilter.length > 0;

  const matchesPartnerFilter = useCallback((entry) => {
    if (!partnerFilterActive) {
      return true;
    }

    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const candidateValues = [
      entry.partnerCode,
      entry.PartnerCompanyCode,
      entry.condition?.PartnerCompanyCode,
      entry.condition?.partnerCompanyCode
    ];

    return candidateValues.some((value) => {
      const normalized = normalizeLookupKey(value);
      return normalized ? normalized.includes(normalizedPartnerFilter) : false;
    });
  }, [partnerFilterActive, normalizedPartnerFilter]);

  const filterShipmentsByPartner = useCallback((shipments) => {
    const list = Array.isArray(shipments) ? shipments : [];
    if (!partnerFilterActive) {
      return list;
    }
    return list.filter((shipment) => (
      Array.isArray(shipment?.contractMatches)
        ? shipment.contractMatches.some(matchesPartnerFilter)
        : false
    ));
  }, [partnerFilterActive, matchesPartnerFilter]);

  const partnerFilteredShipments = useMemo(() => {
    if (!partnerFilterActive) {
      return null;
    }

    const result = new Map();
    shipLoadInfo.forEach((info, key) => {
      const filtered = filterShipmentsByPartner(info?.shipments);
      if (filtered.length > 0) {
        result.set(key, filtered);
      }
    });
    return result;
  }, [shipLoadInfo, filterShipmentsByPartner, partnerFilterActive]);

  // Compute system-level shipment counts and details
  const systemShipmentCounts = useMemo(() => {
    const counts = new Map();
    const shipmentDetails = new Map(); // Map<systemId, Array<shipment info>>

    // Helper to find system ID from planet natural ID
    const findSystemIdFromPlanet = (planetNaturalId) => {
      if (!planetNaturalId || !planetData || typeof planetData !== 'object') return null;

      for (const [sysId, planets] of Object.entries(planetData)) {
        for (const planet of planets || []) {
          if (planet?.PlanetNaturalId === planetNaturalId) {
            return sysId;
          }
        }
      }
      return null;
    };

    // Helper to find system ID from station using stationData
    // Returns SystemId which matches the format used in the map
    // Note: storage.AddressableId often matches station.WarehouseId
    const findSystemIdFromStation = (storageId, addressableId) => {
      if (!stationData || !Array.isArray(stationData)) return null;

      // Try to match by comparing storage fields with station WarehouseId
      for (const station of stationData) {
        if (!station || typeof station !== 'object') continue;

        // Storage AddressableId often matches station WarehouseId
        if (addressableId && station.WarehouseId === addressableId) {
          return station.SystemId;
        }

        // Also try matching StorageId to WarehouseId
        if (storageId && station.WarehouseId === storageId) {
          return station.SystemId;
        }

        // Try matching AddressableId to AddressableId (if station has it)
        if (addressableId && station.AddressableId === addressableId) {
          return station.SystemId;
        }
      }

      return null;
    };

    // Helper to find system ID from warehouse/station natural ID using universeData
    const findSystemIdFromWarehouse = (naturalId) => {
      if (!naturalId || !universeData || typeof universeData !== 'object') return null;

      const normalizedId = String(naturalId).toUpperCase().trim();

      for (const [systemId, entries] of Object.entries(universeData)) {
        if (!Array.isArray(entries)) continue;

        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') continue;

          const entryNaturalId = entry.NaturalId || entry.naturalId;
          if (entryNaturalId && String(entryNaturalId).toUpperCase().trim() === normalizedId) {
            return systemId;
          }
        }
      }
      return null;
    };

    // Helper to extract system from AddressableId (format: planet.system or station.system)
    const extractSystemFromAddressableId = (addressableId) => {
      if (!addressableId || typeof addressableId !== 'string') return null;

      const parts = addressableId.split('.');
      if (parts.length >= 2) {
        // Last part is typically the system
        return parts[parts.length - 1];
      }
      return null;
    };

    // Count shipments from storage (planetary storage + warehouses)
    // Badge shows where shipments currently ARE, not where they're going
    (storageData || []).forEach((storage) => {
      if (!storage || typeof storage !== 'object') return;

      // Find the system where this storage is located
      let systemId = null;

      // Try 1: Station data lookup (for WAREHOUSE_STORE - most accurate)
      // Note: storage.AddressableId often matches station.WarehouseId
      if (storage.Type === 'WAREHOUSE_STORE' || storage.Type === 'STATION_STORE') {
        const storageId = storage.StorageId;
        const addressableId = storage.AddressableId;
        systemId = findSystemIdFromStation(storageId, addressableId);
      }

      // Try 2: Planet natural ID (for planetary storage)
      if (!systemId) {
        const planetNaturalId = storage.PlanetNaturalId;
        if (planetNaturalId) {
          systemId = findSystemIdFromPlanet(planetNaturalId);
        }
      }

      // Try 3: Warehouse/Station natural ID using universeData
      if (!systemId) {
        const warehouseNaturalId = storage.StorageNaturalId || storage.NaturalId;
        if (warehouseNaturalId) {
          systemId = findSystemIdFromWarehouse(warehouseNaturalId);
        }
      }

      // Try 4: AddressableId parsing (extract system from format like "ABC.Antares")
      if (!systemId && storage.AddressableId) {
        systemId = extractSystemFromAddressableId(storage.AddressableId);
      }

      // Try 5: LocationName field
      if (!systemId && storage.LocationName) {
        const locationParts = storage.LocationName.split('.');
        if (locationParts.length >= 2) {
          systemId = locationParts[locationParts.length - 1];
        }
      }

      // Try 6: SystemId field directly
      if (!systemId && storage.SystemId) {
        systemId = storage.SystemId;
      }

      if (!systemId) return;

      const items = Array.isArray(storage.StorageItems)
        ? storage.StorageItems
        : (Array.isArray(storage.Items) ? storage.Items : []);

      items.forEach((item) => {
        if (!item || typeof item !== 'object') return;

        const itemTypeRaw = typeof item.Type === 'string' ? item.Type.toLowerCase() : '';
        const isShipment = itemTypeRaw.includes('shipment');

        // Also check if it's linked to a shipment contract
        const candidateIds = [
          item.ShipmentItemId,
          item.ShipmentItemID,
          item.MaterialId,
          item.MaterialID
        ];

        let hasShipmentContract = false;
        for (const candidateId of candidateIds) {
          const normalized = normalizeLookupKey(candidateId);
          if (normalized && shipmentContractsByItemId && shipmentContractsByItemId.has(normalized)) {
            hasShipmentContract = true;
            break;
          }
        }

        // Count if it's a shipment type or has a shipment contract
        if (isShipment || hasShipmentContract) {
          const currentCount = counts.get(systemId) || 0;
          counts.set(systemId, currentCount + 1);

          // Store shipment details for tooltip
          if (!shipmentDetails.has(systemId)) {
            shipmentDetails.set(systemId, []);
          }

          // Find the associated contract(s) using material ID
          let contractInfo = null;
          for (const candidateId of candidateIds) {
            const normalized = normalizeLookupKey(candidateId);
            if (normalized && shipmentContractsByItemId && shipmentContractsByItemId.has(normalized)) {
              const contractEntries = shipmentContractsByItemId.get(normalized);
              // Get the first contract entry (they're already sorted)
              const firstEntry = Array.isArray(contractEntries) ? contractEntries[0] : contractEntries;
              if (firstEntry) {
                contractInfo = {
                  localId: firstEntry.contractLocalId,
                  id: firstEntry.contractId,
                  partnerName: firstEntry.partnerName,
                  partnerCode: firstEntry.partnerCode,
                  destination: firstEntry.destination || firstEntry.party,
                  deadlineEpochMs: firstEntry.deadlineEpochMs,
                  weight: firstEntry.weight,
                  volume: firstEntry.volume
                };
              }
              break;
            }
          }

          shipmentDetails.get(systemId).push({
            amount: item.MaterialAmount || item.Amount || 1,
            weight: item.TotalWeight || 0,
            volume: item.TotalVolume || 0,
            contract: contractInfo,
            storageType: storage.Type,
            locationName: storage.LocationName || storage.PlanetName
          });
        }
      });
    });

    return { counts, shipmentDetails };
  }, [storageData, planetData, universeData, stationData, shipmentContractsByItemId, normalizeLookupKey]);

  const showNoPartnerMatches = partnerFilterActive
    && (!partnerFilteredShipments || partnerFilteredShipments.size === 0);

  useEffect(() => {
    if (!partnerFilterActive) {
      return;
    }

    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const uniqueCodes = new Set();
    let totalContracts = 0;
    let shipmentsMissingCodes = 0;

    shipLoadInfo.forEach((info, shipKey) => {
      const shipments = Array.isArray(info?.shipments) ? info.shipments : [];
      shipments.forEach((shipment, shipmentIndex) => {
        const matches = Array.isArray(shipment?.contractMatches) ? shipment.contractMatches : [];
        if (matches.length === 0) {
          return;
        }

        let shipmentHasCode = false;
        matches.forEach((match, matchIndex) => {
          totalContracts += 1;
          const partnerCode = match?.PartnerCompanyCode
            ?? match?.partnerCompanyCode
            ?? match?.condition?.PartnerCompanyCode
            ?? match?.condition?.partnerCompanyCode
            ?? match?.partnerCode
            ?? null;

          if (partnerCode) {
            uniqueCodes.add(String(partnerCode));
            shipmentHasCode = true;
          } else if (process.env.NODE_ENV === 'development') {
            console.debug('[DataPointOverlay][PartnerFilterDebug] Missing PartnerCompanyCode', {
              shipKey,
              shipmentIndex,
              contractIndex: matchIndex,
              contractId: match?.contractId ?? null,
              contractLocalId: match?.contractLocalId ?? null,
              contractType: match?.contractType ?? null,
              availablePartnerCodeField: match?.partnerCode ?? null
            });
          }
        });

        if (!shipmentHasCode) {
          shipmentsMissingCodes += 1;
        }
      });
    });

    console.debug('[DataPointOverlay][PartnerFilterDebug] Contract summary', {
      filter: normalizedPartnerFilter,
      totalContracts,
      uniquePartnerCodes: Array.from(uniqueCodes).sort(),
      shipmentsMissingCodes
    });
  }, [partnerFilterActive, normalizedPartnerFilter, shipLoadInfo]);

  const getShipLoadInfoById = useCallback((candidate) => {
    const normalized = normalizeLookupKey(candidate);
    if (!normalized) return null;
    return shipLoadInfo.get(normalized) || null;
  }, [shipLoadInfo]);

  const formatCapacityValue = useCallback((value) => {
    const numeric = toNumericValue(value);
    if (numeric == null) return 'Unknown';
    const abs = Math.abs(numeric);
    if (abs >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${(numeric / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(numeric / 1_000).toFixed(1)}k`;
    if (abs >= 1) return numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(1);
    if (abs === 0) return '0';
    return numeric.toFixed(2);
  }, []);

  const buildLoadSummary = useCallback((info) => {
    if (!info) return null;

    const ratioCandidates = [info.ratio, info.volumeRatio, info.weightRatio]
      .map((value) => (Number.isFinite(value) ? Math.max(0, value) : null))
      .filter((value) => value != null);

    if (ratioCandidates.length > 0) {
      const ratioValue = Math.max(...ratioCandidates);
      const clamped = Math.min(ratioValue, 1);
      const overSuffix = ratioValue > 1 ? ' (Over)' : '';
      return `Util ${(clamped * 100).toFixed(1)}%${overSuffix}`;
    }

    return null;
  }, []);

  const buildShipmentTiles = useCallback((info) => {
    if (!info?.shipments?.length) {
      return [];
    }

    const weightKeySet = new Set([
      'weight',
      'totalweight',
      'materialweight',
      'shipmentweight',
      'expectedweight',
      'payloadweight',
      'mass'
    ]);

    const volumeKeySet = new Set([
      'volume',
      'totalvolume',
      'materialvolume',
      'shipmentvolume',
      'expectedvolume',
      'payloadvolume',
      'space'
    ]);

    const pickFromObject = (source, keySet) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return null;
      }

      for (const [key, value] of Object.entries(source)) {
        const normalizedKey = key.trim().toLowerCase();
        if (!keySet.has(normalizedKey)) {
          continue;
        }

        const numeric = toNumericValue(value);
        if (numeric != null && Math.abs(numeric) > 0) {
          return numeric;
        }
      }

      return null;
    };

    const deepSearchForMetric = (root, keySet) => {
      if (!root || typeof root !== 'object') {
        return null;
      }

      const visited = new Set();
      const stack = [root];

      while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== 'object') {
          continue;
        }

        if (visited.has(current)) {
          continue;
        }

        visited.add(current);

        const direct = pickFromObject(current, keySet);
        if (direct != null) {
          return direct;
        }

        if (Array.isArray(current)) {
          for (let i = 0; i < current.length; i += 1) {
            stack.push(current[i]);
          }
        } else {
          Object.values(current).forEach((child) => {
            if (child && typeof child === 'object') {
              stack.push(child);
            }
          });
        }
      }

      return null;
    };

    const resolveMetric = (matchEntry, keySet, storageFallbackCandidates) => {
      const entry = (matchEntry && typeof matchEntry === 'object') ? matchEntry : null;

      const fromMatch = pickFromObject(entry, keySet);
      if (fromMatch != null) {
        return fromMatch;
      }

      const fromCondition = pickFromObject(entry?.condition, keySet);
      if (fromCondition != null) {
        return fromCondition;
      }

      const deepCondition = deepSearchForMetric(entry?.condition, keySet);
      if (deepCondition != null) {
        return deepCondition;
      }

      const deepMatch = deepSearchForMetric(entry, keySet);
      if (deepMatch != null) {
        return deepMatch;
      }

      for (const candidate of storageFallbackCandidates) {
        const numericCandidate = toNumericValue(candidate);
        if (numericCandidate != null && Math.abs(numericCandidate) > 0) {
          return numericCandidate;
        }
      }

      return null;
    };

    return info.shipments.reduce((acc, shipment, index) => {
      if (!shipment || typeof shipment !== 'object') {
        return acc;
      }

      const matches = Array.isArray(shipment.contractMatches) ? shipment.contractMatches : [];
      const deliveryMatches = matches.filter((match) => {
        const typeCandidate = match?.conditionType
          ?? match?.conditionTypeRaw
          ?? match?.condition?.Type
          ?? match?.condition?.type;
        return isDeliveryShipmentType(typeCandidate);
      });

      if (deliveryMatches.length === 0) {
        return acc;
      }

      const preferredMatch = deliveryMatches[0];
      const contractLocalId = preferredMatch?.contractLocalId || preferredMatch?.contractId || shipment.shipmentItemKey;
      const contractLabel = contractLocalId != null ? String(contractLocalId) : `Shipment ${index + 1}`;

      const destination = preferredMatch?.destination
        || preferredMatch?.party
        || shipment.source?.name
        || 'Unknown destination';

      const weightValue = resolveMetric(preferredMatch, weightKeySet, [
        shipment.storageItem?.TotalWeight,
        shipment.storageItem?.MaterialWeight,
        shipment.storageItem?.Weight
      ]);

      const volumeValue = resolveMetric(preferredMatch, volumeKeySet, [
        shipment.storageItem?.TotalVolume,
        shipment.storageItem?.MaterialVolume,
        shipment.storageItem?.Volume
      ]);

      const weightText = weightValue != null ? formatCapacityValue(weightValue) : '—';
      const volumeText = volumeValue != null ? formatCapacityValue(volumeValue) : '—';

      // Calculate deadline text
      let deadlineText = '';
      const deadlineEpochMs = preferredMatch?.deadlineEpochMs;
      if (deadlineEpochMs) {
        const deadlineDate = new Date(deadlineEpochMs);
        const now = new Date();
        const totalHours = Math.round((deadlineDate - now) / (1000 * 60 * 60));
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;

        if (days > 0) {
          deadlineText = ` (${days}d ${hours}h)`;
        } else {
          deadlineText = ` (${hours}h)`;
        }
      }

      acc.push({
        id: shipment.shipmentItemKey || `${index}`,
        contractId: contractLabel,
        destination: String(destination),
        weightText,
        volumeText,
        lines: [
          `Contract ${contractLabel}${deadlineText}`,
          `Wt ${weightText} · Vol ${volumeText}`,
          `Dest ${String(destination)}`
        ]
      });

      return acc;
    }, []);
  }, [formatCapacityValue]);

  const getLoadColorForRatio = useCallback((ratio) => {
    if (ratio == null || !Number.isFinite(ratio)) {
      return null;
    }
    const clamped = Math.max(0, Math.min(ratio, 1.1));
    return loadColorScale(clamped);
  }, [loadColorScale]);

  const buildLoadBarDescriptors = useCallback((info) => {
    if (!info) return [];

    const descriptors = [];

    const coerceNumber = (value) => {
      if (value == null) return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    };

    const buildSummary = (kindLabel, ratioValue, loadValue, capacityValue) => {
      const percentText = ratioValue != null
        ? `${(Math.min(ratioValue, 1) * 100).toFixed(1)}%${ratioValue > 1 ? ' (Over)' : ''}`
        : null;
      const loadText = loadValue != null ? formatCapacityValue(loadValue) : null;
      const capacityText = capacityValue != null ? formatCapacityValue(capacityValue) : null;

      const parts = [];
      parts.push(percentText ? `${kindLabel} ${percentText}` : kindLabel);
      if (loadText && capacityText) {
        parts.push(`${loadText} / ${capacityText}`);
      } else if (capacityText) {
        parts.push(`Cap ${capacityText}`);
      } else if (loadText) {
        parts.push(`Load ${loadText}`);
      }

      return parts.filter(Boolean).join(' · ');
    };

    const addDescriptor = (key, kindLabel, ratioValue, loadValue, capacityValue) => {
      const numericLoad = coerceNumber(loadValue);
      const numericCapacity = coerceNumber(capacityValue);
      const normalizedRatio = (() => {
        if (ratioValue != null && Number.isFinite(ratioValue)) {
          return Math.max(0, ratioValue);
        }
        if (numericCapacity != null && numericCapacity > 0 && numericLoad != null) {
          return Math.max(0, numericLoad / numericCapacity);
        }
        return null;
      })();

      if (normalizedRatio == null && numericLoad == null && numericCapacity == null) {
        return;
      }

      descriptors.push({
        key,
        kindLabel,
        ratio: normalizedRatio,
        load: numericLoad,
        capacity: numericCapacity,
        summary: buildSummary(kindLabel, normalizedRatio, numericLoad, numericCapacity)
      });
    };

    addDescriptor('volume', 'Vol', info.volumeRatio, info.volumeLoad, info.volumeCapacity);
    addDescriptor('weight', 'Wt', info.weightRatio, info.weightLoad, info.weightCapacity);

    if (descriptors.length === 0 && info.ratio != null && Number.isFinite(info.ratio)) {
      const normalized = Math.max(0, info.ratio);
      descriptors.push({
        key: 'utilization',
        kindLabel: 'Util',
        ratio: normalized,
        load: null,
        capacity: null,
        summary: buildSummary('Util', normalized, null, null)
      });
    }

    return descriptors;
  }, [formatCapacityValue]);

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

  const handlePartnerFilterChange = useCallback((event) => {
    setPartnerFilter(event.target.value);
  }, []);

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

    const { g } = mapRef.current;

    const getLayer = (className) => {
      let layer = g.select(`g.${className}`);
      if (layer.empty()) {
        layer = g.append('g').attr('class', className);
      }
      return layer;
    };

    const flightLayer = getLayer('flight-layer');
    const overlayLayer = getLayer('overlay-layer');
    const shipLayer = getLayer('ship-layer');

    flightLayer.selectAll('*').remove();
    shipLayer.selectAll('*').remove();
    overlayLayer.selectAll('*').remove();

    overlayLayer.raise();
    shipLayer.raise();

    const { byId: planetsById, byNaturalId: planetsByNaturalId } = planetLookups;

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

    const getPrimaryShipId = (ship) => {
      if (!ship) return null;
      const candidates = [ship.ShipId, ship.Id, ship.Ship, ship.Registration, ship.Name];
      const match = candidates.find((candidate) => candidate != null);
      return match != null ? String(match) : null;
    };

    const getShipLoadInfo = (ship, explicitKey) => (
      getShipLoadInfoById(explicitKey ?? getPrimaryShipId(ship))
    );

    const classifyShipType = (ship, explicitKey) => {
      const loadInfo = getShipLoadInfo(ship, explicitKey);
      let volumeCapacity = loadInfo?.volumeCapacity;
      let weightCapacity = loadInfo?.weightCapacity;

      if ((volumeCapacity == null || !Number.isFinite(volumeCapacity)) && ship) {
        volumeCapacity = pickNumericValue(ship, STORAGE_VOLUME_CAPACITY_FIELDS);
      }

      if ((weightCapacity == null || !Number.isFinite(weightCapacity)) && ship) {
        weightCapacity = pickNumericValue(ship, STORAGE_WEIGHT_CAPACITY_FIELDS);
      }

      if (!Number.isFinite(volumeCapacity)) {
        volumeCapacity = null;
      }

      if (!Number.isFinite(weightCapacity)) {
        weightCapacity = null;
      }

      const toComparable = (value) => {
        if (value == null || !Number.isFinite(value)) return null;
        return Math.round(value);
      };

      const approxMatches = (expected, actual) => {
        if (expected == null || actual == null) return false;
        if (expected === 0) return actual === 0;
        const tolerance = Math.max(1, expected * 0.02);
        return Math.abs(actual - expected) <= tolerance;
      };

      const normalizedVolume = toComparable(volumeCapacity);
      const normalizedWeight = toComparable(weightCapacity);

      const matchedProfile = (() => {
        if (normalizedWeight != null && normalizedVolume != null) {
          return SHIP_CAPACITY_PROFILES.find((profile) => (
            approxMatches(profile.weight, normalizedWeight)
            && approxMatches(profile.volume, normalizedVolume)
          )) || null;
        }

        const singleValue = normalizedWeight ?? normalizedVolume;
        if (singleValue == null) {
          return null;
        }

        return SHIP_CAPACITY_PROFILES.find((profile) => (
          profile.weight === profile.volume
          && approxMatches(profile.weight, singleValue)
        )) || null;
      })();

      if (matchedProfile) {
        return {
          key: matchedProfile.key,
          label: matchedProfile.label,
          color: matchedProfile.color,
          volumeCapacity,
          weightCapacity,
          loadInfo
        };
      }

      return {
        key: 'unknown',
        label: 'Unknown Capacity',
        color: '#9ca3af',
        volumeCapacity,
        weightCapacity,
        loadInfo
      };
    };

    const getShipColor = (ship, explicitKey) => classifyShipType(ship, explicitKey).color;

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
        const shipStyle = classifyShipType(ship, flightShipIdStr);
        const pathColor = shipStyle.color;
        const shipTypeLabel = shipStyle.label;
        const loadInfo = shipStyle.loadInfo;
        const shipIdentifierForFilter = getPrimaryShipId(ship) ?? flightShipIdStr;
        const normalizedShipKey = normalizeLookupKey(shipIdentifierForFilter);
        const filteredShipments = partnerFilterActive
          ? ((normalizedShipKey && partnerFilteredShipments?.get(normalizedShipKey))
            || filterShipmentsByPartner(loadInfo?.shipments))
          : (Array.isArray(loadInfo?.shipments) ? loadInfo.shipments : []);

        if (partnerFilterActive && filteredShipments.length === 0) {
          return;
        }

        const loadInfoForTiles = loadInfo
          ? { ...loadInfo, shipments: filteredShipments }
          : { shipments: filteredShipments };
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
        let isSTLOnly = true; // Track if this is an STL-only flight

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

          // If we reach here, there's at least one inter-system segment
          isSTLOnly = false;

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
          // Check if this is an STL-only flight - don't skip it, let it show as idle with STL status
          if (isSTLOnly && segmentsRaw.length > 0 && (firstLocation?.systemId || finalLocation?.systemId)) {
            flightDiagnostics.push({
              shipId: flightShipIdStr,
              shipName: ship?.Name || ship?.ShipName || flightShipIdStr || 'Unknown',
              flightId: flight?.FlightId ?? null,
              state: 'stl-only',
              systemId: firstLocation?.systemId || finalLocation?.systemId,
              segments: segmentsRaw.length
            });
            // Don't add to activeShipIds - let it render as "idle" with STL info
          } else {
            flightDiagnostics.push({
              shipId: flightShipIdStr,
              shipName: ship?.Name || ship?.ShipName || flightShipIdStr || 'Unknown',
              flightId: flight?.FlightId ?? null,
              state: 'skipped-no-segments'
            });
          }
          return;
        }

        const flightTiming = computeFlightTiming(flight, segmentPairs);

        const segmentIndexCandidatesRaw = [
          flight?.CurrentSegmentIndex,
          flight?.SegmentIndex,
          ship?.CurrentSegmentIndex,
          ship?.SegmentIndex,
          ship?.CurrentSegment
        ];
        const hasSegmentIndexData = segmentIndexCandidatesRaw.some((value) => (
          typeof value === 'number' && !Number.isNaN(value)
        ));

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
        const hasProgressData = rawProgress != null;
        const hasTraversalData = hasSegmentIndexData || hasProgressData;

        // Flight data only includes active flights, so we treat all flights with segments as active
        flightDiagnostics.push({
          shipId: flightShipIdStr,
          shipName: ship?.Name || ship?.ShipName || flightShipIdStr || 'Unknown',
          flightId: flight?.FlightId ?? null,
          state: 'active',
          progress: numericProgress,
          segments: segmentPairs.length
        });

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

        const interpolatedPosition = ship ? interpolateShipPosition(ship, segmentPairs, flight) : null;
        const activeSegmentIndex = (hasTraversalData && Number.isInteger(interpolatedPosition?.segmentIndex))
          ? interpolatedPosition.segmentIndex
          : null;
        const activeSegmentProgress = (hasTraversalData && typeof interpolatedPosition?.progress === 'number')
          ? clamp01(interpolatedPosition.progress)
          : null;

        if (flight.FlightId) {
          flightSegmentsCache.set(flight.FlightId, segmentPairs);
        }
        if (flight.ShipId) {
          flightSegmentsCache.set(flight.ShipId, segmentPairs);
        }
        if (flightShipIdStr) {
          flightSegmentsCache.set(flightShipIdStr, segmentPairs);
        }

        segmentPairs.forEach((segmentInfo, segmentIndex) => {
          if (hasTraversalData && activeSegmentIndex != null && segmentIndex < activeSegmentIndex) {
            return;
          }

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

          let pathStart = offsetFrom;

          if (hasTraversalData && activeSegmentIndex != null && segmentIndex === activeSegmentIndex) {
            const progress = activeSegmentProgress != null ? activeSegmentProgress : 0;
            if (progress >= 0.999) {
              return;
            }

            const baseStart = {
              x: segmentInfo.fromCenter.x + (segmentInfo.toCenter.x - segmentInfo.fromCenter.x) * progress,
              y: segmentInfo.fromCenter.y + (segmentInfo.toCenter.y - segmentInfo.fromCenter.y) * progress
            };

            pathStart = offsetAmount === 0 ? baseStart : applyOffset(baseStart);
          }

          const startPoint = pathStart;
          const endPoint = offsetTo;
          const deltaX = endPoint.x - startPoint.x;
          const deltaY = endPoint.y - startPoint.y;
          if (Math.hypot(deltaX, deltaY) < 0.01) {
            return;
          }

          flightLayer.append('path')
            .attr('class', 'flight-path')
            .attr('d', lineGenerator([startPoint, endPoint]))
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
          const interpolated = interpolatedPosition
            || interpolateShipPosition(ship, segmentsForShip || segmentPairs, flight);
          if (interpolated) {
            const effectiveZoom = Math.max(1, zoomLevel);
            const radius = Math.max(6 / effectiveZoom, 3);
            const positionKey = `${Math.round(interpolated.x / 5)}:${Math.round(interpolated.y / 5)}`;
            const markerSlot = getMarkerSlot(positionKey);
            const baseSpacing = Math.max(radius * 2.1, 6 / effectiveZoom);

            const identifierForLoad = getPrimaryShipId(ship) ?? flightShipIdStr;
            const shipIdStr = identifierForLoad != null ? String(identifierForLoad) : (flightShipIdStr || 'unknown');

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

            const markerGroup = shipLayer.append('g')
              .attr('class', 'ship-group')
              .attr('data-ship-id', shipIdStr);

            markerGroup.raise();

            // Create thick chevron arrow shape
            const chevronSize = Math.max(9 / effectiveZoom, 4.5);
            const chevronWidth = chevronSize * 0.8;

            // Default direction is right if no direction provided
            const dirX = interpolated.direction?.x || 1;
            const dirY = interpolated.direction?.y || 0;

            // Calculate angle of direction
            const angle = Math.atan2(dirY, dirX) * (180 / Math.PI);

            // Create chevron shape pointing right (will be rotated)
            // Chevron consists of two lines forming a ">" shape
            const halfHeight = chevronWidth / 2;
            const chevronPath = `
              M ${-chevronSize * 0.3} ${-halfHeight}
              L ${chevronSize * 0.5} 0
              L ${-chevronSize * 0.3} ${halfHeight}
            `;

            // Add white outline for visibility
            markerGroup.append('path')
              .attr('d', chevronPath)
              .attr('transform', `translate(${markerX}, ${markerY}) rotate(${angle})`)
              .attr('fill', 'none')
              .attr('stroke', '#ffffff')
              .attr('stroke-width', Math.max(5 / effectiveZoom, 3.5))
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('opacity', 0.8);

            // Main thick chevron
            markerGroup.append('path')
              .attr('d', chevronPath)
              .attr('transform', `translate(${markerX}, ${markerY}) rotate(${angle})`)
              .attr('fill', 'none')
              .attr('stroke', pathColor)
              .attr('stroke-width', Math.max(3.5 / effectiveZoom, 2))
              .attr('stroke-linecap', 'round')
              .attr('stroke-linejoin', 'round')
              .attr('opacity', 0.95);

            // Add shipment count badge if there are shipments
            const shipmentCount = filteredShipments.length;
            if (shipmentCount > 0) {
              const badgeRadius = Math.max(7 / effectiveZoom, 4.2);
              const badgeOffsetX = chevronSize * 1.2;
              const badgeOffsetY = -chevronSize * 1.2;
              const badgeFontSize = Math.max(8.4 / effectiveZoom, 5.6);

              // Badge background circle
              markerGroup.append('circle')
                .attr('cx', markerX + badgeOffsetX)
                .attr('cy', markerY + badgeOffsetY)
                .attr('r', badgeRadius)
                .attr('fill', '#ef4444')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', Math.max(1.12 / effectiveZoom, 0.7))
                .attr('opacity', 0.95);

              // Badge count text
              markerGroup.append('text')
                .attr('x', markerX + badgeOffsetX)
                .attr('y', markerY + badgeOffsetY)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('fill', '#ffffff')
                .attr('font-size', `${badgeFontSize}px`)
                .attr('font-weight', 700)
                .attr('opacity', 1)
                .text(shipmentCount > 99 ? '99+' : shipmentCount);
            }

            const labelX = markerX + radius + 6;
            const labelY = markerY - (radius * 0.8);
            const baseFontSize = 8;
            const lineHeight = baseFontSize * 1.2;

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

            const loadSummary = buildLoadSummary(loadInfo);
            const shipmentTiles = buildShipmentTiles(loadInfoForTiles);
            const loadBarDescriptors = buildLoadBarDescriptors(loadInfo);

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

            if (!labelsEnabled) {
              label.style('display', 'none');
            }

            const labelPaddingX = 6;
            const labelPaddingY = 3;
            const labelCornerRadius = 4;
            const labelBackground = markerGroup.insert('rect', 'text')
              .attr('class', 'ship-label-background')
              .attr('fill', 'rgba(15, 23, 42, 0.85)')
              .attr('stroke', '#000000')
              .attr('stroke-width', 0.5)
              .attr('rx', labelCornerRadius)
              .attr('ry', labelCornerRadius)
              .attr('opacity', 0.95)
              .style('pointer-events', 'none')
              .style('display', 'none');

            let loadBarsContainer = null;
            let loadBarEntries = [];

            if (loadBarDescriptors.length > 0) {
              loadBarsContainer = markerGroup.append('g')
                .attr('class', 'ship-load-bars')
                .style('pointer-events', 'none')
                .style('display', 'none');

              loadBarEntries = loadBarDescriptors.map((descriptor) => {
                const barGroup = loadBarsContainer.append('g')
                  .attr('class', `ship-load-bar ship-load-bar-${descriptor.key}`);
                const background = barGroup.append('rect')
                  .attr('class', 'ship-load-bar-bg');
                const fill = barGroup.append('rect')
                  .attr('class', 'ship-load-bar-fill');
                const labelNode = barGroup.append('text')
                  .attr('class', 'ship-load-bar-label')
                  .attr('text-anchor', 'middle')
                  .attr('dominant-baseline', 'hanging')
                  .attr('font-weight', 500)
                  .attr('fill', '#bfdbfe');

                return {
                  descriptor,
                  group: barGroup,
                  background,
                  fill,
                  label: labelNode
                };
              });
            }

            let shipmentTilesContainer = null;
            let shipmentTileEntries = [];

            if (shipmentTiles.length > 0) {
              shipmentTilesContainer = markerGroup.append('g')
                .attr('class', 'ship-shipment-tiles')
                .style('pointer-events', 'none')
                .style('display', 'none');

              shipmentTileEntries = shipmentTiles.map((tile) => {
                const tileGroup = shipmentTilesContainer.append('g')
                  .attr('class', 'ship-shipment-tile');

                const background = tileGroup.append('rect')
                  .attr('class', 'ship-shipment-tile-bg');

                const textNode = tileGroup.append('text')
                  .attr('class', 'ship-shipment-tile-text')
                  .attr('text-anchor', 'start')
                  .attr('dominant-baseline', 'hanging')
                  .attr('font-weight', 500);

                const lineTspans = tile.lines.map((line) => textNode.append('tspan').text(line));

                return {
                  tile,
                  group: tileGroup,
                  background,
                  text: textNode,
                  lineTspans
                };
              });
            }

            const updateInfoLayout = () => {
              const labelNode = label.node();
              if (!labelNode) return;
              const bbox = labelNode.getBBox();
              if (!bbox || (bbox.width === 0 && bbox.height === 0)) return;

              let minX = bbox.x;
              const minY = bbox.y;
              let maxX = bbox.x + bbox.width;
              let maxY = bbox.y + bbox.height;

              if (loadBarsContainer && loadBarEntries.length > 0) {
                const baseBarWidth = Math.max(bbox.width, 70);
                const barHeight = 6;
                const barRadius = barHeight / 2;
                const gap = 4;
                const barX = bbox.x;
                let currentY = bbox.y + bbox.height + gap;

                loadBarEntries.forEach((entry, index) => {
                  const ratioValueRaw = entry.descriptor.ratio != null ? entry.descriptor.ratio : 0;
                  const ratioValue = Math.max(0, Math.min(ratioValueRaw, 1.1));
                  const fillRatio = Math.min(ratioValue, 1);
                  const barWidth = baseBarWidth;

                  entry.group.attr('transform', `translate(${barX}, ${currentY})`);

                  entry.background
                    .attr('width', barWidth)
                    .attr('height', barHeight)
                    .attr('rx', barRadius)
                    .attr('ry', barRadius)
                    .attr('fill', 'rgba(15, 23, 42, 0.85)')
                    .attr('stroke', '#0f172a')
                    .attr('stroke-width', 0.5)
                    .attr('opacity', 0.95);

                  entry.fill
                    .attr('width', Math.max(barWidth * fillRatio, 2))
                    .attr('height', barHeight)
                    .attr('rx', barRadius)
                    .attr('ry', barRadius)
                    .attr('fill', getLoadColorForRatio(ratioValue) || '#38bdf8')
                    .attr('opacity', 0.95);

                  const labelFontSize = 9;
                  const labelGap = 4;
                  const labelText = entry.descriptor.summary
                    || `${entry.descriptor.kindLabel} ${(Math.min(ratioValue, 1) * 100).toFixed(1)}%`;

                  entry.label
                    .attr('x', barWidth / 2)
                    .attr('y', barHeight + labelGap)
                    .attr('font-size', `${labelFontSize}px`)
                    .text(labelText);

                  const barBottom = currentY + barHeight + labelGap + labelFontSize;

                  if (index === loadBarEntries.length - 1) {
                    maxY = Math.max(maxY, barBottom);
                  } else {
                    maxY = Math.max(maxY, barBottom + 2);
                  }

                  minX = Math.min(minX, barX);
                  maxX = Math.max(maxX, barX + barWidth);

                  currentY = barBottom + 2;
                });
              }

              if (shipmentTilesContainer && shipmentTileEntries.length > 0) {
                const tilePaddingX = 6;
                const tilePaddingY = 4;
                const tileGap = 4;
                const tileRadius = 4;
                const textFontSize = 9;
                const tileLineHeight = baseFontSize * 1.05;
                const tileX = bbox.x;
                let currentY = Math.max(maxY + tileGap, bbox.y + bbox.height + tileGap);

                shipmentTileEntries.forEach((entry) => {
                  entry.group.attr('transform', `translate(${tileX}, ${currentY})`);

                  entry.text
                    .attr('x', tilePaddingX)
                    .attr('y', tilePaddingY)
                    .attr('fill', '#e0f2fe')
                    .attr('font-size', `${textFontSize}px`);

                  entry.lineTspans.forEach((tspanNode, idx) => {
                    tspanNode
                      .attr('x', tilePaddingX)
                      .attr('dy', idx === 0 ? 0 : tileLineHeight)
                      .attr('fill', idx === 0 ? '#facc15' : (idx === 1 ? '#bae6fd' : '#cbd5f5'))
                      .attr('font-weight', idx === 0 ? 700 : (idx === 1 ? 600 : 500))
                      .text(entry.tile.lines[idx]);
                  });

                  const textNode = entry.text.node();
                  const textBBox = textNode && typeof textNode.getBBox === 'function'
                    ? textNode.getBBox()
                    : null;

                  const tileWidth = textBBox
                    ? Math.max(bbox.width, textBBox.width + tilePaddingX * 2)
                    : Math.max(bbox.width, 90);
                  const tileHeight = textBBox
                    ? textBBox.height + tilePaddingY * 2
                    : tilePaddingY * 2 + tileLineHeight * entry.tile.lines.length;

                  entry.background
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('width', tileWidth)
                    .attr('height', tileHeight)
                    .attr('rx', tileRadius)
                    .attr('ry', tileRadius)
                    .attr('fill', 'rgba(12, 25, 46, 0.92)')
                    .attr('stroke', '#3b82f6')
                    .attr('stroke-width', 0.75)
                    .attr('opacity', 0.95);

                  minX = Math.min(minX, tileX);
                  maxX = Math.max(maxX, tileX + tileWidth);
                  const tileBottom = currentY + tileHeight;
                  maxY = Math.max(maxY, tileBottom);

                  currentY = tileBottom + tileGap;
                });
              }

              labelBackground
                .attr('x', minX - labelPaddingX)
                .attr('y', minY - labelPaddingY)
                .attr('width', (maxX - minX) + (labelPaddingX * 2))
                .attr('height', (maxY - minY) + (labelPaddingY * 2));
            };

            label.append('tspan')
              .attr('x', labelX)
              .attr('dy', 0)
              .style('font-size', `${baseFontSize * 1.25}px`)
              .attr('font-weight', 700)
              .text(shipDisplayName);

            const typeDescription = shipTypeLabel;

            const typeTspan = label.append('tspan')
              .attr('x', labelX)
              .attr('dy', `${lineHeight}px`)
              .attr('fill', '#c7d2fe')
              .attr('font-weight', 500)
              .style('font-size', `${baseFontSize * 1.05}px`)
              .style('display', 'none')
              .text(typeDescription);

            const statusTspan = label.append('tspan')
              .attr('x', labelX)
              .attr('dy', `${lineHeight}px`)
              .attr('fill', '#facc15')
              .attr('font-weight', 600)
              .style('font-size', `${baseFontSize * 1.05}px`)
              .style('display', 'none')
              .text(statusLabel);

            const loadSummaryTspan = loadSummary
              ? label.append('tspan')
                .attr('x', labelX)
                .attr('dy', `${lineHeight}px`)
                .attr('fill', '#bfdbfe')
                .attr('font-weight', 500)
                .style('font-size', `${baseFontSize}px`)
                .style('display', 'none')
                .text(loadSummary)
              : null;

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
            const infoSpans = [typeTspan, statusTspan, loadSummaryTspan, remainingTspan, etaTspan].filter(Boolean);

            const showInfo = () => {
              markerGroup.raise();
              label.style('display', null);
              infoSpans.forEach((span) => span.style('display', null));
              labelBackground.style('display', null);
              if (loadBarsContainer) {
                loadBarsContainer.style('display', null);
              }
              if (shipmentTilesContainer) {
                shipmentTilesContainer.style('display', null);
              }
              updateInfoLayout();
            };

            const hideInfo = () => {
              infoSpans.forEach((span) => span.style('display', 'none'));
              labelBackground.style('display', 'none');
              if (loadBarsContainer) {
                loadBarsContainer.style('display', 'none');
              }
              if (shipmentTilesContainer) {
                shipmentTilesContainer.style('display', 'none');
              }
              if (!labelsEnabled) {
                label.style('display', 'none');
              }
            };

            // Enable pointer events on tooltip elements to keep them visible when hovering
            if (labelBackground) {
              labelBackground.style('pointer-events', 'all');
            }
            if (loadBarsContainer) {
              loadBarsContainer.style('pointer-events', 'all');
            }
            if (shipmentTilesContainer) {
              shipmentTilesContainer.style('pointer-events', 'all');
            }

            const tooltipElements = [labelBackground, loadBarsContainer, shipmentTilesContainer].filter(Boolean);

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

            // Keep tooltip visible when hovering over tooltip elements
            tooltipElements.forEach(element => {
              if (element) {
                element
                  .on('mouseover.tooltip', () => {
                    showInfo();
                  })
                  .on('mouseout.tooltip', (event) => {
                    const related = event.relatedTarget;
                    const groupNode = markerGroup.node();
                    if (related && groupNode && groupNode.contains(related)) {
                      return;
                    }
                    hideInfo();
                  });
              }
            });
          }
        }
      });
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
          return;
        }

        let locationSystemId = getShipLocationSystemId(ship);
        let idleLocationDetails = getShipLocationDetails(ship, locationSystemId);
        let effectiveSystemId = idleLocationDetails?.systemId || locationSystemId;

        // If no location found but ship has an STL flight, get system from flight
        if (!effectiveSystemId) {
          const shipFlight = flightsByShipId.get(ship.ShipId) || flightsByShipId.get(ship.Id);
          if (shipFlight && Array.isArray(shipFlight.Segments) && shipFlight.Segments.length > 0) {
            // Extract system from flight segments
            const firstSegment = shipFlight.Segments[0];
            const originLocation = extractLocationDetails(firstSegment.OriginLines);
            const destinationLocation = extractLocationDetails(firstSegment.DestinationLines);
            const flightSystemId = originLocation?.systemId || destinationLocation?.systemId;
            if (flightSystemId) {
              effectiveSystemId = flightSystemId;
              idleLocationDetails = originLocation || destinationLocation;
            }
          }
        }

        if (!effectiveSystemId) {
          return;
        }

        const systemCenter = getSystemCenter(effectiveSystemId);

        if (!systemCenter) {
          return;
        }

        const effectiveZoom = Math.max(1, zoomLevel);
        // Make idle ship markers 33% smaller
        const radius = Math.max(4 / effectiveZoom, 2);
        const positionKey = `${Math.round(systemCenter.x / 5)}:${Math.round(systemCenter.y / 5)}`;
        const markerSlot = getMarkerSlot(positionKey);

        // Arrange idle ships in rings around the system marker (no center position)
        // First ring: 8 ships, Second ring: 16 ships, etc.
        const shipsPerRing = [8, 16, 24, 32]; // Ring sizes
        let ringIndex = 0;
        let positionInRing = markerSlot;
        let cumulativeShips = 0;

        // Determine which ring and position within that ring
        for (let i = 0; i < shipsPerRing.length; i++) {
          if (positionInRing < shipsPerRing[i]) {
            ringIndex = i;
            break;
          }
          positionInRing -= shipsPerRing[i];
          cumulativeShips += shipsPerRing[i];
          ringIndex = i + 1;
        }

        // If we have more ships than planned rings, keep adding rings
        if (ringIndex >= shipsPerRing.length) {
          const extraShips = markerSlot - cumulativeShips;
          const shipsInExtraRing = 32 + (ringIndex - shipsPerRing.length + 1) * 8;
          positionInRing = extraShips % shipsInExtraRing;
        }

        // Arrange in a ring (no center position) - rings are closer together
        const ringRadius = Math.max(8 / effectiveZoom, 6) * (ringIndex + 1);
        const shipsInThisRing = ringIndex < shipsPerRing.length
          ? shipsPerRing[ringIndex]
          : 32 + (ringIndex - shipsPerRing.length + 1) * 8;
        const angle = (positionInRing / shipsInThisRing) * 2 * Math.PI;
        const offsetX = Math.cos(angle) * ringRadius;
        const offsetY = Math.sin(angle) * ringRadius;

        const markerX = systemCenter.x + offsetX;
        const markerY = systemCenter.y + offsetY;
        const shipStyle = classifyShipType(ship, shipIdStr);
        const pathColor = shipStyle.color;
        const loadInfo = shipStyle.loadInfo;
        const normalizedShipKey = normalizeLookupKey(getPrimaryShipId(ship) ?? shipIdStr);
        const filteredShipments = partnerFilterActive
          ? ((normalizedShipKey && partnerFilteredShipments?.get(normalizedShipKey))
            || filterShipmentsByPartner(loadInfo?.shipments))
          : (Array.isArray(loadInfo?.shipments) ? loadInfo.shipments : []);

        if (partnerFilterActive && filteredShipments.length === 0) {
          return;
        }

        const loadInfoForTiles = loadInfo
          ? { ...loadInfo, shipments: filteredShipments }
          : { shipments: filteredShipments };

        const locationName = formatLocationDisplay(idleLocationDetails)
          || systemNames[effectiveSystemId]
          || effectiveSystemId
          || 'Unknown';
        const shipDisplayName = ship.Name || ship.ShipName || ship.ShipId || 'Unknown';

        // Check if this ship has an STL flight and get destination
        const shipFlight = flightsByShipId.get(ship.ShipId) || flightsByShipId.get(ship.Id);
        const hasSTLFlight = shipFlight && Array.isArray(shipFlight.Segments) && shipFlight.Segments.length > 0;

        let statusLabel = `Idle at ${locationName}`;
        if (hasSTLFlight && shipFlight.Segments.length > 0) {
          // Get the destination from the current or next segment
          const currentSegmentIndex = shipFlight.CurrentSegmentIndex ?? 0;
          const currentSegment = shipFlight.Segments[currentSegmentIndex];
          if (currentSegment) {
            const destinationLocation = extractLocationDetails(currentSegment.DestinationLines);
            const destinationDisplay = formatLocationDisplay(destinationLocation);
            if (destinationDisplay) {
              statusLabel = `STL Transit to ${destinationDisplay}`;
            } else {
              statusLabel = `STL Transit in ${locationName}`;
            }
          } else {
            statusLabel = `STL Transit in ${locationName}`;
          }
        }

        const shipTypeLabel = shipStyle.label;
        const loadSummary = buildLoadSummary(loadInfo);
        const shipmentTiles = buildShipmentTiles(loadInfoForTiles);
        const loadBarDescriptors = buildLoadBarDescriptors(loadInfo);
        const timeRemainingText = '—';
        const etaText = '—';

        const markerGroup = shipLayer.append('g')
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

        // Add shipment count badge if there are shipments
        const shipmentCount = filteredShipments.length;
        if (shipmentCount > 0) {
          const badgeRadius = Math.max(7 / effectiveZoom, 4.2);
          const badgeOffsetX = radius * 2.0;
          const badgeOffsetY = -radius * 2.0;
          const badgeFontSize = Math.max(8.4 / effectiveZoom, 5.6);

          // Badge background circle
          markerGroup.append('circle')
            .attr('cx', markerX + badgeOffsetX)
            .attr('cy', markerY + badgeOffsetY)
            .attr('r', badgeRadius)
            .attr('fill', '#ef4444')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', Math.max(1.12 / effectiveZoom, 0.7))
            .attr('opacity', 0.95);

          // Badge count text
          markerGroup.append('text')
            .attr('x', markerX + badgeOffsetX)
            .attr('y', markerY + badgeOffsetY)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', '#ffffff')
            .attr('font-size', `${badgeFontSize}px`)
            .attr('font-weight', 700)
            .attr('opacity', 1)
            .text(shipmentCount > 99 ? '99+' : shipmentCount);
        }

        const labelX = markerX + radius + 6;
        const labelY = markerY - (radius * 0.8);
        const baseFontSize = 8;
        const lineHeight = baseFontSize * 1.2;

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

        if (!labelsEnabled) {
          label.style('display', 'none');
        }

        const labelPaddingX = 6;
        const labelPaddingY = 3;
        const labelCornerRadius = 4;
        const labelBackground = markerGroup.insert('rect', 'text')
          .attr('class', 'ship-label-background')
          .attr('fill', 'rgba(15, 23, 42, 0.85)')
          .attr('stroke', '#000000')
          .attr('stroke-width', 0.5)
          .attr('rx', labelCornerRadius)
          .attr('ry', labelCornerRadius)
          .attr('opacity', 0.95)
          .style('pointer-events', 'none')
          .style('display', 'none');

        let loadBarsContainer = null;
        let loadBarEntries = [];

        if (loadBarDescriptors.length > 0) {
          loadBarsContainer = markerGroup.append('g')
            .attr('class', 'ship-load-bars')
            .style('pointer-events', 'none')
            .style('display', 'none');

          loadBarEntries = loadBarDescriptors.map((descriptor) => {
            const barGroup = loadBarsContainer.append('g')
              .attr('class', `ship-load-bar ship-load-bar-${descriptor.key}`);
            const background = barGroup.append('rect')
              .attr('class', 'ship-load-bar-bg');
            const fill = barGroup.append('rect')
              .attr('class', 'ship-load-bar-fill');
            const labelNode = barGroup.append('text')
              .attr('class', 'ship-load-bar-label')
              .attr('text-anchor', 'middle')
              .attr('dominant-baseline', 'hanging')
              .attr('font-weight', 500)
              .attr('fill', '#bfdbfe');

            return {
              descriptor,
              group: barGroup,
              background,
              fill,
              label: labelNode
            };
          });
        }

        let shipmentTilesContainer = null;
        let shipmentTileEntries = [];

        if (shipmentTiles.length > 0) {
          shipmentTilesContainer = markerGroup.append('g')
            .attr('class', 'ship-shipment-tiles')
            .style('pointer-events', 'none')
            .style('display', 'none');

          shipmentTileEntries = shipmentTiles.map((tile) => {
            const tileGroup = shipmentTilesContainer.append('g')
              .attr('class', 'ship-shipment-tile');

            const background = tileGroup.append('rect')
              .attr('class', 'ship-shipment-tile-bg');

            const textNode = tileGroup.append('text')
              .attr('class', 'ship-shipment-tile-text')
              .attr('text-anchor', 'start')
              .attr('dominant-baseline', 'hanging')
              .attr('font-weight', 500);

            const lineTspans = tile.lines.map((line) => textNode.append('tspan').text(line));

            return {
              tile,
              group: tileGroup,
              background,
              text: textNode,
              lineTspans
            };
          });
        }

        const updateInfoLayout = () => {
          const labelNode = label.node();
          if (!labelNode) return;
          const bbox = labelNode.getBBox();
          if (!bbox || (bbox.width === 0 && bbox.height === 0)) return;

          let minX = bbox.x;
          const minY = bbox.y;
          let maxX = bbox.x + bbox.width;
          let maxY = bbox.y + bbox.height;

          if (loadBarsContainer && loadBarEntries.length > 0) {
            const baseBarWidth = Math.max(bbox.width, 70);
            const barHeight = 6;
            const barRadius = barHeight / 2;
            const gap = 4;
            const barX = bbox.x;
            let currentY = bbox.y + bbox.height + gap;

            loadBarEntries.forEach((entry, index) => {
              const ratioValueRaw = entry.descriptor.ratio != null ? entry.descriptor.ratio : 0;
              const ratioValue = Math.max(0, Math.min(ratioValueRaw, 1.1));
              const fillRatio = Math.min(ratioValue, 1);
              const barWidth = baseBarWidth;

              entry.group.attr('transform', `translate(${barX}, ${currentY})`);

              entry.background
                .attr('width', barWidth)
                .attr('height', barHeight)
                .attr('rx', barRadius)
                .attr('ry', barRadius)
                .attr('fill', 'rgba(15, 23, 42, 0.85)')
                .attr('stroke', '#0f172a')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.95);

              entry.fill
                .attr('width', Math.max(barWidth * fillRatio, 2))
                .attr('height', barHeight)
                .attr('rx', barRadius)
                .attr('ry', barRadius)
                .attr('fill', getLoadColorForRatio(ratioValue) || '#38bdf8')
                .attr('opacity', 0.95);

              const labelFontSize = 9;
              const labelGap = 4;
              const labelText = entry.descriptor.summary
                || `${entry.descriptor.kindLabel} ${(Math.min(ratioValue, 1) * 100).toFixed(1)}%`;

              entry.label
                .attr('x', barWidth / 2)
                .attr('y', barHeight + labelGap)
                .attr('font-size', `${labelFontSize}px`)
                .text(labelText);

              const barBottom = currentY + barHeight + labelGap + labelFontSize;

              if (index === loadBarEntries.length - 1) {
                maxY = Math.max(maxY, barBottom);
              } else {
                maxY = Math.max(maxY, barBottom + 2);
              }

              minX = Math.min(minX, barX);
              maxX = Math.max(maxX, barX + barWidth);

              currentY = barBottom + 2;
            });
          }

          if (shipmentTilesContainer && shipmentTileEntries.length > 0) {
            const tilePaddingX = 6;
            const tilePaddingY = 4;
            const tileGap = 4;
            const tileRadius = 4;
            const textFontSize = 9;
            const tileLineHeight = baseFontSize * 1.05;
            const tileX = bbox.x;
            let currentY = Math.max(maxY + tileGap, bbox.y + bbox.height + tileGap);

            shipmentTileEntries.forEach((entry) => {
              entry.group.attr('transform', `translate(${tileX}, ${currentY})`);

              entry.text
                .attr('x', tilePaddingX)
                .attr('y', tilePaddingY)
                .attr('fill', '#e0f2fe')
                .attr('font-size', `${textFontSize}px`);

              entry.lineTspans.forEach((tspanNode, idx) => {
                tspanNode
                  .attr('x', tilePaddingX)
                  .attr('dy', idx === 0 ? 0 : tileLineHeight)
                  .attr('fill', idx === 0 ? '#facc15' : (idx === 1 ? '#bae6fd' : '#cbd5f5'))
                  .attr('font-weight', idx === 0 ? 700 : (idx === 1 ? 600 : 500))
                  .text(entry.tile.lines[idx]);
              });

              const textNode = entry.text.node();
              const textBBox = textNode && typeof textNode.getBBox === 'function'
                ? textNode.getBBox()
                : null;

              const tileWidth = textBBox
                ? Math.max(bbox.width, textBBox.width + tilePaddingX * 2)
                : Math.max(bbox.width, 90);
              const tileHeight = textBBox
                ? textBBox.height + tilePaddingY * 2
                : tilePaddingY * 2 + tileLineHeight * entry.tile.lines.length;

              entry.background
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', tileWidth)
                .attr('height', tileHeight)
                .attr('rx', tileRadius)
                .attr('ry', tileRadius)
                .attr('fill', 'rgba(12, 25, 46, 0.92)')
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 0.75)
                .attr('opacity', 0.95);

              minX = Math.min(minX, tileX);
              maxX = Math.max(maxX, tileX + tileWidth);
              const tileBottom = currentY + tileHeight;
              maxY = Math.max(maxY, tileBottom);

              currentY = tileBottom + tileGap;
            });
          }

          labelBackground
            .attr('x', minX - labelPaddingX)
            .attr('y', minY - labelPaddingY)
            .attr('width', (maxX - minX) + (labelPaddingX * 2))
            .attr('height', (maxY - minY) + (labelPaddingY * 2));
        };

        label.append('tspan')
          .attr('x', labelX)
          .attr('dy', 0)
          .style('font-size', `${baseFontSize * 1.25}px`)
          .attr('font-weight', 700)
          .text(shipDisplayName);

        const typeDescription = shipTypeLabel;

        const typeTspan = label.append('tspan')
          .attr('x', labelX)
          .attr('dy', `${lineHeight}px`)
          .attr('fill', '#c7d2fe')
          .attr('font-weight', 500)
          .style('font-size', `${baseFontSize * 1.05}px`)
          .style('display', 'none')
          .text(typeDescription);

        const statusTspan = label.append('tspan')
          .attr('x', labelX)
          .attr('dy', `${lineHeight}px`)
          .attr('fill', '#facc15')
          .attr('font-weight', 600)
          .style('font-size', `${baseFontSize * 1.05}px`)
          .style('display', 'none')
          .text(statusLabel);

        const loadSummaryTspan = loadSummary
          ? label.append('tspan')
            .attr('x', labelX)
            .attr('dy', `${lineHeight}px`)
            .attr('fill', '#bfdbfe')
            .attr('font-weight', 500)
            .style('font-size', `${baseFontSize}px`)
            .style('display', 'none')
            .text(loadSummary)
          : null;

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

        const infoSpans = [typeTspan, statusTspan, loadSummaryTspan, remainingTspan, etaTspan].filter(Boolean);

        const showInfo = () => {
          markerGroup.raise();
          label.style('display', null);
          infoSpans.forEach((span) => span.style('display', null));
          labelBackground.style('display', null);
          if (loadBarsContainer) {
            loadBarsContainer.style('display', null);
          }
          if (shipmentTilesContainer) {
            shipmentTilesContainer.style('display', null);
          }
          updateInfoLayout();
        };

        const hideInfo = () => {
          infoSpans.forEach((span) => span.style('display', 'none'));
          labelBackground.style('display', 'none');
          if (loadBarsContainer) {
            loadBarsContainer.style('display', 'none');
          }
          if (shipmentTilesContainer) {
            shipmentTilesContainer.style('display', 'none');
          }
          if (!labelsEnabled) {
            label.style('display', 'none');
          }
        };

        // Enable pointer events on tooltip elements to keep them visible when hovering
        if (labelBackground) {
          labelBackground.style('pointer-events', 'all');
        }
        if (loadBarsContainer) {
          loadBarsContainer.style('pointer-events', 'all');
        }
        if (shipmentTilesContainer) {
          shipmentTilesContainer.style('pointer-events', 'all');
        }

        const tooltipElements = [labelBackground, loadBarsContainer, shipmentTilesContainer].filter(Boolean);

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

        // Keep tooltip visible when hovering over tooltip elements
        tooltipElements.forEach(element => {
          if (element) {
            element
              .on('mouseover.tooltip', () => {
                showInfo();
              })
              .on('mouseout.tooltip', (event) => {
                const related = event.relatedTarget;
                const groupNode = markerGroup.node();
                if (related && groupNode && groupNode.contains(related)) {
                  return;
                }
                hideInfo();
              });
          }
        });
      });
    }

    // Render system-level shipment count badges
    if (systemShipmentCounts && systemShipmentCounts.counts && systemShipmentCounts.counts.size > 0) {
      const effectiveZoom = Math.max(1, zoomLevel);
      systemShipmentCounts.counts.forEach((count, systemId) => {
        if (count === 0) return;

        const systemCenter = getSystemCenter(systemId);
        if (!systemCenter) return;

        const badgeRadius = Math.max(7 / effectiveZoom, 4.2);
        const badgeOffsetX = 0;
        const badgeOffsetY = 0;
        const badgeFontSize = Math.max(9.8 / effectiveZoom, 5.6);

        const badgeGroup = overlayLayer.append('g')
          .attr('class', 'system-shipment-badge')
          .style('cursor', 'pointer');

        // Badge background circle
        badgeGroup.append('circle')
          .attr('cx', systemCenter.x + badgeOffsetX)
          .attr('cy', systemCenter.y - badgeOffsetY)
          .attr('r', badgeRadius)
          .attr('fill', '#3b82f6')
          .attr('stroke', '#ffffff')
          .attr('stroke-width', Math.max(1.4 / effectiveZoom, 0.98))
          .attr('opacity', 0.95);

        // Badge count text
        badgeGroup.append('text')
          .attr('x', systemCenter.x + badgeOffsetX)
          .attr('y', systemCenter.y - badgeOffsetY)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', '#ffffff')
          .attr('font-size', `${badgeFontSize}px`)
          .attr('font-weight', 700)
          .attr('opacity', 1)
          .text(count > 999 ? '999+' : count);

        // Add hover functionality to show shipment details (SVG-based like ship tooltips)
        const shipments = systemShipmentCounts.shipmentDetails.get(systemId) || [];
        const systemName = systemNames[systemId] || systemId;

        // Create tooltip group (hidden by default)
        const tooltipGroup = overlayLayer.append('g')
          .attr('class', 'system-shipment-tooltip')
          .style('pointer-events', 'none')
          .style('display', 'none');

        // Build individual shipment tiles (not grouped)
        const contractTiles = [];
        let shipmentsWithoutContract = 0;

        shipments.forEach(shipment => {
          if (shipment.contract?.localId) {
            const contract = shipment.contract;
            const contractLocalId = contract.localId;

            const weightText = shipment.weight > 0 ? formatCapacityValue(shipment.weight) : '—';
            const volumeText = shipment.volume > 0 ? formatCapacityValue(shipment.volume) : '—';
            const destination = contract.destination || '—';
            const locationName = shipment.locationName || '—';

            let deadlineText = '';
            if (contract.deadlineEpochMs) {
              const deadlineDate = new Date(contract.deadlineEpochMs);
              const now = new Date();
              const totalHours = Math.round((deadlineDate - now) / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;

              if (days > 0) {
                deadlineText = ` (${days}d ${hours}h)`;
              } else {
                deadlineText = ` (${hours}h)`;
              }
            }

            contractTiles.push({
              localId: contractLocalId,
              deadlineText,
              weightText,
              volumeText,
              destination,
              locationName,
              lines: [
                `Contract ${contractLocalId}${deadlineText}`,
                `Wt ${weightText} · Vol ${volumeText}`,
                `Dest ${destination}`
              ]
            });
          } else {
            shipmentsWithoutContract++;
          }
        });

        const updateTooltipLayout = () => {
          tooltipGroup.selectAll('*').remove();

          if (shipments.length === 0) return;

          const baseFontSize = 9.6;
          const lineHeight = baseFontSize * 1.2;
          const tilePaddingX = 6.4;
          const tilePaddingY = 4.8;
          const tileGap = 4.8;
          const tileRadius = 3.2;
          const headerFontSize = 10.4;

          const tooltipX = systemCenter.x + 12;
          const tooltipY = systemCenter.y - 8;

          // Header
          const headerText = tooltipGroup.append('text')
            .attr('x', tooltipX)
            .attr('y', tooltipY)
            .attr('fill', '#f7a600')
            .attr('font-size', `${headerFontSize}px`)
            .attr('font-weight', 700)
            .attr('text-anchor', 'start')
            .attr('dominant-baseline', 'hanging')
            .text(systemName);

          let currentY = tooltipY + headerFontSize + tileGap;

          // Summary line showing shipments without tracked contracts
          let infoText = null;

          if (shipmentsWithoutContract > 0) {
            const summaryText = `${shipmentsWithoutContract} shipment${shipmentsWithoutContract > 1 ? 's' : ''} without tracked contract`;

            infoText = tooltipGroup.append('text')
              .attr('x', tooltipX)
              .attr('y', currentY)
              .attr('fill', '#fbbf24')
              .attr('font-size', `${baseFontSize}px`)
              .attr('font-weight', 600)
              .attr('text-anchor', 'start')
              .attr('dominant-baseline', 'hanging')
              .text(summaryText);

            currentY += baseFontSize + tileGap;
          }

          // First pass: calculate max width for all tiles and info text
          let maxWidth = 0;

          // Include info text width in calculation
          if (infoText) {
            const infoTextBBox = infoText.node().getBBox();
            maxWidth = Math.max(maxWidth, infoTextBBox.width);
          }
          const tileElements = [];

          contractTiles.forEach(tile => {
            const tileGroup = tooltipGroup.append('g');

            const tileText = tileGroup.append('text')
              .attr('x', tilePaddingX)
              .attr('y', tilePaddingY)
              .attr('font-size', `${baseFontSize}px`)
              .attr('text-anchor', 'start')
              .attr('dominant-baseline', 'hanging');

            tile.lines.forEach((line, idx) => {
              tileText.append('tspan')
                .attr('x', tilePaddingX)
                .attr('dy', idx === 0 ? 0 : lineHeight)
                .attr('fill', idx === 0 ? '#facc15' : (idx === 1 ? '#bae6fd' : '#cbd5f5'))
                .attr('font-weight', idx === 0 ? 700 : (idx === 1 ? 600 : 500))
                .text(line);
            });

            const textBBox = tileText.node().getBBox();
            const tileWidth = textBBox.width + tilePaddingX * 2;
            const tileHeight = textBBox.height + tilePaddingY * 2;

            maxWidth = Math.max(maxWidth, tileWidth);

            tileElements.push({
              group: tileGroup,
              text: tileText,
              width: tileWidth,
              height: tileHeight
            });
          });

          // Second pass: position tiles with uniform width
          tileElements.forEach(element => {
            element.group.attr('transform', `translate(${tooltipX}, ${currentY})`);

            element.group.insert('rect', 'text')
              .attr('x', 0)
              .attr('y', 0)
              .attr('width', maxWidth)
              .attr('height', element.height)
              .attr('rx', tileRadius)
              .attr('ry', tileRadius)
              .attr('fill', 'rgba(12, 25, 46, 0.92)')
              .attr('stroke', '#3b82f6')
              .attr('stroke-width', 0.6)
              .attr('opacity', 0.95);

            currentY += element.height + tileGap;
          });

          // Background for entire tooltip
          const totalHeight = currentY - tooltipY;
          tooltipGroup.insert('rect', ':first-child')
            .attr('x', tooltipX - tilePaddingX)
            .attr('y', tooltipY - tilePaddingY)
            .attr('width', maxWidth + tilePaddingX * 2)
            .attr('height', totalHeight + tilePaddingY)
            .attr('rx', 4.8)
            .attr('ry', 4.8)
            .attr('fill', 'rgba(0, 0, 0, 0.9)')
            .attr('stroke', '#444')
            .attr('stroke-width', 0.8)
            .attr('opacity', 0.95);
        };

        // Enable pointer events on tooltip to keep it visible when hovering
        tooltipGroup.style('pointer-events', 'all');

        const showTooltip = () => {
          tooltipGroup.style('display', null);
          updateTooltipLayout();
        };

        const hideTooltip = () => {
          tooltipGroup.style('display', 'none');
        };

        badgeGroup
          .on('mouseover', function () {
            showTooltip();
          })
          .on('mouseout', function (event) {
            const related = event.relatedTarget;
            const tooltipNode = tooltipGroup.node();
            if (related && tooltipNode && tooltipNode.contains(related)) {
              return;
            }
            hideTooltip();
          });

        tooltipGroup
          .on('mouseover', function () {
            showTooltip();
          })
          .on('mouseout', function (event) {
            const related = event.relatedTarget;
            const badgeNode = badgeGroup.node();
            const tooltipNode = tooltipGroup.node();
            if (related && (
              (badgeNode && badgeNode.contains(related)) ||
              (tooltipNode && tooltipNode.contains(related))
            )) {
              return;
            }
            hideTooltip();
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

      const systemGroup = overlayLayer.append('g')
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
  }, [mapRef, isOverlayVisible, isLoading, error, meteorDensityData, luminosityData, systemNames, maxValues, ships, flights, graph, selectedShipId, planetLookups, systemLookups, showShipLabels, getShipLoadInfoById, getLoadColorForRatio, buildLoadSummary, buildShipmentTiles, buildLoadBarDescriptors, formatCapacityValue, partnerFilterActive, partnerFilteredShipments, filterShipmentsByPartner, systemShipmentCounts]);

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

  const partnerFilterDisplay = partnerFilter.trim().toUpperCase();

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
        padding: '10px 14px',
        borderRadius: '8px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        fontSize: '12px',
        lineHeight: 1.4,
        minWidth: '220px'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none'
          }}
          onClick={() => setIsShipFilterCollapsed(!isShipFilterCollapsed)}
        >
          <span style={{ fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '11px' }}>Ship Filter</span>
          <span style={{ fontSize: '14px', opacity: 0.7 }}>{isShipFilterCollapsed ? '▶' : '▼'}</span>
        </div>

        {!isShipFilterCollapsed && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.85 }}>Filter shipments by company code</span>
              <input
                type="text"
                value={partnerFilter}
                onChange={handlePartnerFilterChange}
                placeholder="Company code"
                style={{
                  background: '#1f2933',
                  color: '#f5f5f5',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  padding: '5px 6px',
                  fontSize: '12px',
                  outline: 'none'
                }}
              />
            </label>

            {showNoPartnerMatches ? (
              <span style={{ fontSize: '11px', color: '#fca5a5' }}>
                {`No shipments found for company code "${partnerFilterDisplay}"`}
              </span>
            ) : null}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.85 }}>Ship Filter</span>
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

            <button
              type="button"
              onClick={toggleShipLabels}
              style={{
                marginTop: '4px',
                background: labelsEnabled ? '#f7a600' : '#3b82f6',
                color: '#0b0d10',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              {labelsEnabled ? 'Hide Ship Labels' : 'Show Ship Labels'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default React.memo(DataPointOverlay);