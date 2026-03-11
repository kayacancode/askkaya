/**
 * Twins API - Twin Management Endpoint
 *
 * CRUD operations for twins (queryable knowledge personas)
 *
 * GET /twinsApi - List accessible twins
 * GET /twinsApi/:twinId - Get specific twin
 * POST /twinsApi - Create twin (person for self, team/org for admins)
 * PUT /twinsApi/:twinId - Update twin
 * DELETE /twinsApi/:twinId - Delete twin (admin only)
 */

import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';
import { listAccessibleTwins, buildResolutionContext, ResolvedTwin } from '../services/twin-resolver';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Twin creation request
 */
export interface CreateTwinRequest {
  name: string;
  slug: string;
  type: 'person' | 'team' | 'organization';
  description?: string;
  expertiseAreas?: string[];
  visibility?: 'private' | 'team' | 'tenant';
  teamId?: string;
}

/**
 * Twin update request
 */
export interface UpdateTwinRequest {
  name?: string;
  description?: string;
  expertiseAreas?: string[];
  visibility?: 'private' | 'team' | 'tenant';
}

/**
 * List twins accessible to the user
 */
export async function listTwins(
  uid: string,
  tenantId: string
): Promise<{ twins: ResolvedTwin[] }> {
  const context = await buildResolutionContext(uid, tenantId);
  if (!context) {
    throw new Error('User not found in tenant');
  }

  const twins = await listAccessibleTwins(context);
  return { twins };
}

/**
 * Get a specific twin by ID
 */
export async function getTwin(
  uid: string,
  tenantId: string,
  twinId: string
): Promise<ResolvedTwin | null> {
  const db = getDb();
  const context = await buildResolutionContext(uid, tenantId);
  if (!context) {
    throw new Error('User not found in tenant');
  }

  const twinDoc = await db.collection('twins').doc(twinId).get();
  if (!twinDoc.exists) {
    return null;
  }

  const data = twinDoc.data()!;

  // Verify tenant match
  if (data.tenantId !== tenantId) {
    throw new Error('Access denied');
  }

  // Verify access by visibility
  const visibility = data.visibility as 'private' | 'team' | 'tenant';
  if (visibility === 'private' && data.ownerUid !== uid) {
    throw new Error('Access denied');
  }
  if (visibility === 'team' && !context.teamIds.includes(data.teamId)) {
    throw new Error('Access denied');
  }

  return {
    twinId: twinDoc.id,
    tenantId: data.tenantId,
    type: data.type,
    name: data.name,
    slug: data.slug,
    visibility,
    ownerUid: data.ownerUid,
    teamId: data.teamId,
    expertiseAreas: data.expertiseAreas || [],
  };
}

/**
 * Create a new twin
 */
export async function createTwin(
  uid: string,
  tenantId: string,
  request: CreateTwinRequest
): Promise<{ twinId: string }> {
  const db = getDb();
  const context = await buildResolutionContext(uid, tenantId);
  if (!context) {
    throw new Error('User not found in tenant');
  }

  // Validate slug uniqueness within tenant
  const existingSlug = await db
    .collection('twins')
    .where('tenantId', '==', tenantId)
    .where('slug', '==', request.slug.toLowerCase())
    .limit(1)
    .get();

  if (!existingSlug.empty) {
    throw new Error('Slug already exists in this tenant');
  }

  // Determine visibility and ownership based on type
  let ownerUid: string | undefined;
  let teamId: string | undefined;
  let visibility = request.visibility || 'tenant';

  if (request.type === 'person') {
    // Person twins are owned by the creator
    ownerUid = uid;
    visibility = request.visibility || 'private';
  } else if (request.type === 'team') {
    // Team twins require admin or team membership
    teamId = request.teamId;
    if (!teamId) {
      throw new Error('teamId is required for team twins');
    }
    if (!context.teamIds.includes(teamId)) {
      // Check if user is tenant admin
      const membership = await db
        .collection('memberships')
        .doc(`${uid}_${tenantId}`)
        .get();
      const role = membership.data()?.role;
      if (role !== 'owner' && role !== 'admin') {
        throw new Error('Access denied - must be team member or tenant admin');
      }
    }
    visibility = request.visibility || 'team';
  } else if (request.type === 'organization') {
    // Org twins require tenant admin
    const membership = await db
      .collection('memberships')
      .doc(`${uid}_${tenantId}`)
      .get();
    const role = membership.data()?.role;
    if (role !== 'owner' && role !== 'admin') {
      throw new Error('Access denied - tenant admin required');
    }
    visibility = 'tenant';
  }

  const twinRef = await db.collection('twins').add({
    tenantId,
    type: request.type,
    name: request.name,
    slug: request.slug.toLowerCase(),
    description: request.description || '',
    expertiseAreas: request.expertiseAreas || [],
    visibility,
    ownerUid,
    teamId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: uid,
  });

  logger.info('Twin created', {
    twinId: twinRef.id,
    tenantId,
    type: request.type,
    createdBy: uid,
  });

  return { twinId: twinRef.id };
}

/**
 * Update an existing twin
 */
export async function updateTwin(
  uid: string,
  tenantId: string,
  twinId: string,
  request: UpdateTwinRequest
): Promise<{ success: boolean }> {
  const db = getDb();

  const twinDoc = await db.collection('twins').doc(twinId).get();
  if (!twinDoc.exists) {
    throw new Error('Twin not found');
  }

  const data = twinDoc.data()!;

  // Verify tenant match
  if (data.tenantId !== tenantId) {
    throw new Error('Access denied');
  }

  // Check update permission
  const canUpdate = await canModifyTwin(db, uid, tenantId, data);
  if (!canUpdate) {
    throw new Error('Access denied');
  }

  // Build update object
  const updates: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };

  if (request.name !== undefined) updates.name = request.name;
  if (request.description !== undefined) updates.description = request.description;
  if (request.expertiseAreas !== undefined) updates.expertiseAreas = request.expertiseAreas;
  if (request.visibility !== undefined) updates.visibility = request.visibility;

  await twinDoc.ref.update(updates);

  logger.info('Twin updated', {
    twinId,
    tenantId,
    updatedBy: uid,
  });

  return { success: true };
}

/**
 * Delete a twin
 */
export async function deleteTwin(
  uid: string,
  tenantId: string,
  twinId: string
): Promise<{ success: boolean }> {
  const db = getDb();

  const twinDoc = await db.collection('twins').doc(twinId).get();
  if (!twinDoc.exists) {
    throw new Error('Twin not found');
  }

  const data = twinDoc.data()!;

  // Verify tenant match
  if (data.tenantId !== tenantId) {
    throw new Error('Access denied');
  }

  // Only tenant admins can delete
  const membership = await db
    .collection('memberships')
    .doc(`${uid}_${tenantId}`)
    .get();
  const role = membership.data()?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new Error('Access denied - tenant admin required');
  }

  // Soft delete by archiving
  await twinDoc.ref.update({
    status: 'archived',
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    archivedBy: uid,
  });

  logger.info('Twin archived', {
    twinId,
    tenantId,
    archivedBy: uid,
  });

  return { success: true };
}

/**
 * Check if user can modify a twin
 */
async function canModifyTwin(
  db: admin.firestore.Firestore,
  uid: string,
  tenantId: string,
  twinData: admin.firestore.DocumentData
): Promise<boolean> {
  // Person twins can be modified by owner
  if (twinData.type === 'person' && twinData.ownerUid === uid) {
    return true;
  }

  // Check if user is tenant admin
  const membership = await db
    .collection('memberships')
    .doc(`${uid}_${tenantId}`)
    .get();
  const role = membership.data()?.role;

  return role === 'owner' || role === 'admin';
}
