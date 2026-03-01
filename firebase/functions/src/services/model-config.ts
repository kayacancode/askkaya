/**
 * Model Configuration Service
 *
 * Loads model mappings from Firestore and handles admin-controlled model routing.
 *
 * Ported from: github.com/2389-research/platform-2389
 */

import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

/**
 * Lazy initialize Firebase Admin and Firestore
 */
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Model configuration stored in Firestore
 * Collection: llmConfig, Document: "models"
 */
export interface ModelConfig {
  /** Model ID as stored in config (e.g., "claude-sonnet-4-5") */
  id: string;
  /** Whether this model is available for use */
  enabled: boolean;
  /** Provider to route to (anthropic, openai, openrouter) */
  provider: 'anthropic' | 'openai' | 'openrouter';
  /** The actual model ID to send to the provider */
  backendModel: string;
  /** Provider who owns/created this model (for /v1/models response) */
  ownedBy: string;
  /** Optional base URL override for the provider */
  baseUrl?: string;
  /** Price per 1K input tokens in USD */
  inputPricePer1K: number;
  /** Price per 1K output tokens in USD */
  outputPricePer1K: number;
}

// In-memory cache for model config
let modelCache: Map<string, ModelConfig> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Default model configurations - used to seed Firestore if empty
 */
export const DEFAULT_MODELS: ModelConfig[] = [
  // Claude models (via Cloudflare → Anthropic)
  {
    id: 'claude-sonnet-4-5',
    enabled: true,
    provider: 'anthropic',
    backendModel: 'claude-sonnet-4-5-20250929',
    ownedBy: 'anthropic',
    inputPricePer1K: 0.003,
    outputPricePer1K: 0.015,
  },
  {
    id: 'claude-opus-4-5',
    enabled: true,
    provider: 'anthropic',
    backendModel: 'claude-opus-4-5-20251101',
    ownedBy: 'anthropic',
    inputPricePer1K: 0.015,
    outputPricePer1K: 0.075,
  },
  {
    id: 'claude-haiku-3-5',
    enabled: true,
    provider: 'anthropic',
    backendModel: 'claude-3-5-haiku-20241022',
    ownedBy: 'anthropic',
    inputPricePer1K: 0.0008,
    outputPricePer1K: 0.004,
  },
  // OpenAI models (via Cloudflare → OpenAI)
  {
    id: 'gpt-4o',
    enabled: true,
    provider: 'openai',
    backendModel: 'gpt-4o',
    ownedBy: 'openai',
    inputPricePer1K: 0.0025,
    outputPricePer1K: 0.01,
  },
  {
    id: 'gpt-4o-mini',
    enabled: true,
    provider: 'openai',
    backendModel: 'gpt-4o-mini',
    ownedBy: 'openai',
    inputPricePer1K: 0.00015,
    outputPricePer1K: 0.0006,
  },
  // OpenRouter models (via Cloudflare → OpenRouter)
  {
    id: 'qwen-2.5-72b',
    enabled: true,
    provider: 'openrouter',
    backendModel: 'qwen/qwen-2.5-72b-instruct',
    ownedBy: 'qwen',
    inputPricePer1K: 0.00035,
    outputPricePer1K: 0.0004,
  },
  {
    id: 'deepseek-v3',
    enabled: true,
    provider: 'openrouter',
    backendModel: 'deepseek/deepseek-chat',
    ownedBy: 'deepseek',
    inputPricePer1K: 0.00014,
    outputPricePer1K: 0.00028,
  },
];

/**
 * Load model configurations from Firestore
 * Caches results for 1 minute
 */
export async function loadModelConfigs(): Promise<Map<string, ModelConfig>> {
  const now = Date.now();

  // Return cached data if still valid
  if (modelCache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return modelCache;
  }

  const db = getDb();
  const configDoc = await db.collection('llmConfig').doc('models').get();

  if (!configDoc.exists) {
    // Seed with default models
    logger.info('No model config found, seeding with defaults', {});
    await seedDefaultModels();
    return loadModelConfigs(); // Reload after seeding
  }

  const data = configDoc.data();
  const models = (data?.models || []) as ModelConfig[];

  // Build cache map
  modelCache = new Map();
  for (const model of models) {
    modelCache.set(model.id, model);
  }

  cacheLoadedAt = now;
  logger.info('Model config loaded', { modelCount: modelCache.size });

  return modelCache;
}

/**
 * Seed Firestore with default model configurations
 */
async function seedDefaultModels(): Promise<void> {
  const db = getDb();
  await db.collection('llmConfig').doc('models').set({
    models: DEFAULT_MODELS,
    updatedAt: new Date().toISOString(),
  });
  logger.info('Seeded default model configurations', { count: DEFAULT_MODELS.length });
}

/**
 * Get configuration for a specific model
 * Returns null if model doesn't exist or is disabled
 */
export async function getModelConfig(modelId: string): Promise<ModelConfig | null> {
  const configs = await loadModelConfigs();
  const config = configs.get(modelId);

  if (!config) {
    return null;
  }

  if (!config.enabled) {
    logger.info('Model is disabled', { modelId });
    return null;
  }

  return config;
}

/**
 * Get all enabled models
 */
export async function getEnabledModels(): Promise<ModelConfig[]> {
  const configs = await loadModelConfigs();
  return Array.from(configs.values()).filter((m) => m.enabled);
}

/**
 * Check if a model exists and is enabled
 */
export async function isModelAvailable(modelId: string): Promise<boolean> {
  const config = await getModelConfig(modelId);
  return config !== null;
}

/**
 * Clear the model cache (useful for testing or after config updates)
 */
export function clearModelCache(): void {
  modelCache = null;
  cacheLoadedAt = 0;
}

/**
 * Get the assigned model for a user
 * Checks user.assignedModel, then client.defaultModel, then falls back to default
 */
export async function getAssignedModel(uid: string): Promise<ModelConfig> {
  const db = getDb();

  // Get user document
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data();

  let modelId: string | undefined;

  // Check user's assigned model first
  if (userData?.assignedModel) {
    modelId = userData.assignedModel;
  }
  // Fall back to client's default model
  else if (userData?.client_id) {
    const clientDoc = await db.collection('clients').doc(userData.client_id).get();
    const clientData = clientDoc.data();
    if (clientData?.defaultModel) {
      modelId = clientData.defaultModel;
    }
  }

  // Fall back to global default
  if (!modelId) {
    modelId = 'claude-sonnet-4-5';
  }

  const config = await getModelConfig(modelId);
  if (!config) {
    // If assigned model doesn't exist, fall back to default
    logger.warn('Assigned model not found, using default', { modelId, uid });
    const defaultConfig = await getModelConfig('claude-sonnet-4-5');
    if (!defaultConfig) {
      throw new Error('No models configured');
    }
    return defaultConfig;
  }

  return config;
}

/**
 * Set the assigned model for a user (admin function)
 */
export async function setAssignedModel(uid: string, modelId: string): Promise<void> {
  const db = getDb();

  // Verify model exists
  const config = await getModelConfig(modelId);
  if (!config) {
    throw new Error(`Model '${modelId}' not found or not enabled`);
  }

  await db.collection('users').doc(uid).update({
    assignedModel: modelId,
    assignedModelUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('Assigned model updated', { uid, modelId });
}

/**
 * Set the default model for a client (admin function)
 */
export async function setClientDefaultModel(clientId: string, modelId: string): Promise<void> {
  const db = getDb();

  // Verify model exists
  const config = await getModelConfig(modelId);
  if (!config) {
    throw new Error(`Model '${modelId}' not found or not enabled`);
  }

  await db.collection('clients').doc(clientId).update({
    defaultModel: modelId,
    defaultModelUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('Client default model updated', { clientId, modelId });
}
