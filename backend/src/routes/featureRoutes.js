import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function updateFeatureState(featureId, enabled) {
    const configPath = path.join(__dirname, "..", "..", "..", "frontend", "chatFeatures.json");
    // Validate input parameters
    if (typeof featureId !== 'string' || featureId.trim() === '') {
        return { success: false, error: 'Invalid featureId: must be non-empty string' };
    }
    if (typeof enabled !== 'boolean') {
        return { success: false, error: 'Invalid enabled parameter: must be boolean' };
    }

    try {
        // Read existing configuration
        const fileContents = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(fileContents);

        // Validate config structure
        if (!config?.features?.length) {
            throw new Error('Invalid config structure: Missing features array');
        }

        // Find target feature
        const featureIndex = config.features.findIndex(f => f.id === featureId);
        if (featureIndex === -1) {
            throw new Error(`Feature "${featureId}" not found in configuration`);
        }

        // Prevent unnecessary writes if state unchanged
        const feature = config.features[featureIndex];
        if (feature.enabled === enabled) {
            return { success: true, data: config };
        }

        // Update state
        config.features[featureIndex] = { ...feature, enabled };

        // Atomic write operation
        await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        return { success: true, data: config };
    } catch (error) {
        // Handle specific error cases
        if (error.code === 'ENOENT') {
            throw new Error(`Config file not found: ${configPath}`);
        }
        if (error.code === 'EACCES') {
            throw new Error(`Permission denied for file: ${configPath}`);
        }
        if (error.code === 'EISDIR') {
            throw new Error(`${configPath} is a directory`);
        }
        // Fallback for other errors
        return { success: false, error: `Operation failed: ${error.message}`, data: null };
    }
}
