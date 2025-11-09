/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

const MAX_CONTRACT_SNAPSHOT_SIZE = 1500;
const CONTRACT_SNAPSHOT_COLLECTION = "snapshots";
const CONTRACT_SNAPSHOT_DOC_ID = "contracts";
const CONTRACT_SOURCE_URL = "https://rest.fnar.net/contract/allcontracts";

admin.initializeApp();

const prunApiKey = defineSecret("PRUN_API_KEY");

const snapshotDocRef = () => admin
    .firestore()
    .collection(CONTRACT_SNAPSHOT_COLLECTION)
    .doc(CONTRACT_SNAPSHOT_DOC_ID);

const normalizeContractIdentifier = (contract) => {
    if (!contract || typeof contract !== "object") {
        return null;
    }

    const candidates = [
        contract.ContractId,
        contract.contractId,
        contract.Id,
        contract.id,
        contract.ContractNumber,
        contract.contractNumber,
        contract.ContractCode,
        contract.contractCode,
        contract.ContractLocalId,
        contract.contractLocalId
    ];

    for (const candidate of candidates) {
        if (candidate == null) {
            continue;
        }
        const normalized = String(candidate).trim();
        if (normalized.length > 0) {
            return normalized;
        }
    }

    return null;
};

const resolveContractTimestampValue = (contract) => {
    if (!contract || typeof contract !== "object") {
        return -Infinity;
    }

    const candidates = [
        contract.Timestamp,
        contract.timestamp,
        contract.LastUpdated,
        contract.lastUpdated,
        contract.updatedAt,
        contract.UpdatedAt,
        contract.CreatedAt,
        contract.createdAt,
        contract.DueDateEpochMs,
        contract.dueDateEpochMs
    ];

    for (const candidate of candidates) {
        if (candidate == null) {
            continue;
        }

        if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return candidate;
        }

        if (typeof candidate === "string") {
            const parsed = Date.parse(candidate);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
            const numeric = Number(candidate);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }
    }

    return -Infinity;
};

const mergeContractsIntoSnapshot = (existingSnapshot, updates) => {
    const snapshot = Array.isArray(existingSnapshot) ? [...existingSnapshot] : [];
    const idToIndex = new Map();

    snapshot.forEach((existingContract, index) => {
        const id = normalizeContractIdentifier(existingContract);
        if (id && !idToIndex.has(id)) {
            idToIndex.set(id, index);
        }
    });

    (Array.isArray(updates) ? updates : []).forEach((contract) => {
        if (!contract || typeof contract !== "object") {
            return;
        }

        const id = normalizeContractIdentifier(contract);
        if (!id) {
            return;
        }

        if (idToIndex.has(id)) {
            const existingIndex = idToIndex.get(id);
            const existing = snapshot[existingIndex] || {};
            snapshot[existingIndex] = { ...existing, ...contract };
        } else {
            idToIndex.set(id, snapshot.length);
            snapshot.push({ ...contract });
        }
    });

    if (snapshot.length <= MAX_CONTRACT_SNAPSHOT_SIZE) {
        return snapshot;
    }

    const entriesWithTimestamps = snapshot.map((contract, index) => ({
        index,
        timestamp: resolveContractTimestampValue(contract)
    }));

    entriesWithTimestamps.sort((a, b) => {
        if (a.timestamp === b.timestamp) {
            return a.index - b.index;
        }
        return a.timestamp - b.timestamp;
    });

    const excess = snapshot.length - MAX_CONTRACT_SNAPSHOT_SIZE;
    const indicesToDrop = new Set(entriesWithTimestamps.slice(0, excess).map((entry) => entry.index));

    return snapshot.filter((_, index) => !indicesToDrop.has(index));
};

const fetchContractsFromApi = async (apiKey) => {
    if (!apiKey) {
        throw new Error("Missing PRUN API key. Set the secret with `firebase functions:secrets:set PRUN_API_KEY`.");
    }

    const response = await fetch(CONTRACT_SOURCE_URL, {
        headers: {
            Authorization: apiKey,
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "<unreadable>");
        throw new Error(`Contract fetch failed with status ${response.status}: ${errorBody}`);
    }

    const payload = await response.json();
    const contracts = Array.isArray(payload) ? payload : (payload?.Contracts || payload?.contracts || []);
    return Array.isArray(contracts) ? contracts : [];
};

const loadExistingSnapshot = async () => {
    const doc = await snapshotDocRef().get();
    if (!doc.exists) {
        return [];
    }

    const data = doc.data();
    return Array.isArray(data?.contracts) ? data.contracts : [];
};

const persistSnapshot = async (contracts) => {
    await snapshotDocRef().set({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        contracts
    });
};

const updateContractsSnapshot = async (apiKey) => {
    logger.info("Fetching latest contracts from PRUN API");
    const [existingSnapshot, remoteContracts] = await Promise.all([
        loadExistingSnapshot(),
        fetchContractsFromApi(apiKey)
    ]);

    const mergedContracts = mergeContractsIntoSnapshot(existingSnapshot, remoteContracts);
    await persistSnapshot(mergedContracts);

    logger.info("Contract snapshot updated", {
        existingCount: existingSnapshot.length,
        fetchedCount: remoteContracts.length,
        mergedCount: mergedContracts.length
    });

    return {
        existing: existingSnapshot.length,
        fetched: remoteContracts.length,
        merged: mergedContracts.length
    };
};

exports.updateContracts = onRequest({
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [prunApiKey]
}, async (req, res) => {
    try {
        const apiKey = prunApiKey.value();
        const result = await updateContractsSnapshot(apiKey);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        logger.error("Failed to update contract snapshot", error);
        res.status(500).json({ success: false, error: error.message || "Unknown error" });
    }
});

exports.scheduledContractSync = onSchedule({
    region: "us-central1",
    schedule: "every 12 hours",
    timeZone: "Etc/UTC",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [prunApiKey]
}, async () => {
    try {
        const apiKey = prunApiKey.value();
        await updateContractsSnapshot(apiKey);
    } catch (error) {
        logger.error("Scheduled contract sync failed", error);
    }
});
