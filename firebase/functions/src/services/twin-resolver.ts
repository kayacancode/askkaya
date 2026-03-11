/**
 * Twin Resolution Service
 *
 * Resolves target strings (e.g., "kaya", "team", "justin") to twin IDs
 * with proper tenant isolation and visibility-based access control.
 */

import * as admin from 'firebase-admin';
import * as logger from '../utils/logger';

// Lazy initialize Firebase
function getDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

/**
 * Resolved twin information
 */
export interface ResolvedTwin {
  twinId: string;
  tenantId: string;
  type: 'person' | 'team' | 'organization';
  name: string;
  slug: string;
  visibility: 'private' | 'team' | 'tenant';
  ownerUid?: string;
  teamId?: string;
  expertiseAreas: string[];
}

/**
 * Context for twin resolution (from authenticated request)
 */
export interface ResolutionContext {
  requesterUid: string;
  tenantId: string;
  teamIds: string[];
}

/**
 * Result of twin resolution
 */
export interface ResolutionResult {
  success: boolean;
  twin?: ResolvedTwin;
  error?: 'not_found' | 'access_denied' | 'invalid_tenant';
}

/**
 * Resolve a target string to a twin with access validation
 *
 * Target formats supported:
 * - "kaya" → resolve by slug within tenant
 * - "team" → resolve to default team twin
 * - "org" / "organization" → resolve to org twin
 * - "twinId:xxx" → direct twin ID lookup
 *
 * @param target - Target string to resolve
 * @param context - User context for access control
 * @returns Resolution result with twin or error
 */
export async function resolveTwin(
  target: string,
  context: ResolutionContext
): Promise<ResolutionResult> {
  const db = getDb();
  const normalizedTarget = target.toLowerCase().trim();

  logger.debug('Resolving twin target', {
    target,
    tenantId: context.tenantId,
    requesterUid: context.requesterUid,
  });

  try {
    // Handle direct ID format: "twinId:xxx"
    if (normalizedTarget.startsWith('twinid:')) {
      const twinId = target.substring(7); // Keep original case for ID
      return await resolveTwinById(db, twinId, context);
    }

    // Handle special keywords
    if (normalizedTarget === 'team' || normalizedTarget === 'my-team') {
      return await resolveDefaultTeamTwin(db, context);
    }

    if (normalizedTarget === 'org' || normalizedTarget === 'organization') {
      return await resolveOrgTwin(db, context);
    }

    // Standard slug/name resolution within tenant
    return await resolveTwinBySlugOrName(db, normalizedTarget, context);
  } catch (error) {
    logger.error('Twin resolution failed', error as Error, {
      target,
      tenantId: context.tenantId,
    });
    return { success: false, error: 'not_found' };
  }
}

/**
 * Resolve twin by direct ID
 */
async function resolveTwinById(
  db: admin.firestore.Firestore,
  twinId: string,
  context: ResolutionContext
): Promise<ResolutionResult> {
  const twinDoc = await db.collection('twins').doc(twinId).get();

  if (!twinDoc.exists) {
    logger.warn('Twin not found by ID', { twinId });
    return { success: false, error: 'not_found' };
  }

  return validateAndReturnTwin(twinDoc, context);
}

/**
 * Resolve default team twin for user's primary team
 */
async function resolveDefaultTeamTwin(
  db: admin.firestore.Firestore,
  context: ResolutionContext
): Promise<ResolutionResult> {
  if (context.teamIds.length === 0) {
    logger.warn('User has no teams', { requesterUid: context.requesterUid });
    return { success: false, error: 'not_found' };
  }

  // Get first team's default twin
  const teamDoc = await db.collection('teams').doc(context.teamIds[0]!).get();

  if (!teamDoc.exists) {
    logger.warn('Team not found', { teamId: context.teamIds[0] });
    return { success: false, error: 'not_found' };
  }

  const teamData = teamDoc.data()!;

  // Check tenant match
  if (teamData.tenantId !== context.tenantId) {
    return { success: false, error: 'invalid_tenant' };
  }

  if (!teamData.defaultTwinId) {
    // No default twin configured, look for team-type twin
    const teamTwins = await db
      .collection('twins')
      .where('tenantId', '==', context.tenantId)
      .where('teamId', '==', context.teamIds[0])
      .where('type', '==', 'team')
      .limit(1)
      .get();

    if (teamTwins.empty) {
      logger.warn('No team twin found', { teamId: context.teamIds[0] });
      return { success: false, error: 'not_found' };
    }

    return validateAndReturnTwin(teamTwins.docs[0]!, context);
  }

  return resolveTwinById(db, teamData.defaultTwinId, context);
}

/**
 * Resolve organization twin for tenant
 */
async function resolveOrgTwin(
  db: admin.firestore.Firestore,
  context: ResolutionContext
): Promise<ResolutionResult> {
  const orgTwins = await db
    .collection('twins')
    .where('tenantId', '==', context.tenantId)
    .where('type', '==', 'organization')
    .limit(1)
    .get();

  if (orgTwins.empty) {
    logger.warn('No organization twin found', { tenantId: context.tenantId });
    return { success: false, error: 'not_found' };
  }

  return validateAndReturnTwin(orgTwins.docs[0]!, context);
}

/**
 * Resolve twin by slug or name within tenant
 */
async function resolveTwinBySlugOrName(
  db: admin.firestore.Firestore,
  target: string,
  context: ResolutionContext
): Promise<ResolutionResult> {
  // First try exact slug match (most common case)
  const bySlug = await db
    .collection('twins')
    .where('tenantId', '==', context.tenantId)
    .where('slug', '==', target)
    .limit(1)
    .get();

  if (!bySlug.empty) {
    return validateAndReturnTwin(bySlug.docs[0]!, context);
  }

  // Fallback: search by name (case-insensitive substring)
  // Note: Firestore doesn't support case-insensitive queries directly,
  // so we fetch all twins in tenant and filter in memory
  // For production with many twins, consider storing lowercase name field
  const allTwins = await db
    .collection('twins')
    .where('tenantId', '==', context.tenantId)
    .get();

  for (const doc of allTwins.docs) {
    const data = doc.data();
    const nameLower = (data.name || '').toLowerCase();

    // Exact name match or name starts with target
    if (nameLower === target || nameLower.startsWith(target)) {
      return validateAndReturnTwin(doc, context);
    }
  }

  logger.warn('Twin not found by slug or name', {
    target,
    tenantId: context.tenantId,
  });
  return { success: false, error: 'not_found' };
}

/**
 * Validate access to twin and return if allowed
 */
async function validateAndReturnTwin(
  twinDoc: admin.firestore.DocumentSnapshot,
  context: ResolutionContext
): Promise<ResolutionResult> {
  const data = twinDoc.data()!;

  // Check tenant match (critical security check)
  if (data.tenantId !== context.tenantId) {
    logger.warn('Twin belongs to different tenant', {
      twinId: twinDoc.id,
      twinTenantId: data.tenantId,
      requesterTenantId: context.tenantId,
    });
    return { success: false, error: 'access_denied' };
  }

  // Check visibility-based access
  const visibility = data.visibility as 'private' | 'team' | 'tenant';

  if (visibility === 'private' && data.ownerUid !== context.requesterUid) {
    logger.warn('Access denied to private twin', {
      twinId: twinDoc.id,
      ownerUid: data.ownerUid,
      requesterUid: context.requesterUid,
    });
    return { success: false, error: 'access_denied' };
  }

  if (visibility === 'team' && !context.teamIds.includes(data.teamId)) {
    logger.warn('Access denied to team twin', {
      twinId: twinDoc.id,
      twinTeamId: data.teamId,
      requesterTeamIds: context.teamIds,
    });
    return { success: false, error: 'access_denied' };
  }

  // Tenant visibility always allowed for tenant members (already checked tenant match)

  const twin: ResolvedTwin = {
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

  logger.debug('Twin resolved successfully', {
    twinId: twin.twinId,
    twinName: twin.name,
    visibility: twin.visibility,
  });

  return { success: true, twin };
}

/**
 * Get the default twin for a tenant (organization twin)
 * Used when no target is specified in a query
 */
export async function getDefaultTwin(
  context: ResolutionContext
): Promise<ResolutionResult> {
  // Default behavior: resolve to organization twin
  return resolveOrgTwin(getDb(), context);
}

/**
 * List all twins accessible to the user
 */
export async function listAccessibleTwins(
  context: ResolutionContext
): Promise<ResolvedTwin[]> {
  const db = getDb();

  // Get all twins in tenant
  const twinsSnapshot = await db
    .collection('twins')
    .where('tenantId', '==', context.tenantId)
    .get();

  const accessibleTwins: ResolvedTwin[] = [];

  for (const doc of twinsSnapshot.docs) {
    const data = doc.data();
    const visibility = data.visibility as 'private' | 'team' | 'tenant';

    // Check access
    let canAccess = false;

    if (visibility === 'tenant') {
      canAccess = true;
    } else if (visibility === 'team' && context.teamIds.includes(data.teamId)) {
      canAccess = true;
    } else if (visibility === 'private' && data.ownerUid === context.requesterUid) {
      canAccess = true;
    }

    if (canAccess) {
      accessibleTwins.push({
        twinId: doc.id,
        tenantId: data.tenantId,
        type: data.type,
        name: data.name,
        slug: data.slug,
        visibility,
        ownerUid: data.ownerUid,
        teamId: data.teamId,
        expertiseAreas: data.expertiseAreas || [],
      });
    }
  }

  return accessibleTwins;
}

/**
 * Build resolution context from user's membership
 */
export async function buildResolutionContext(
  uid: string,
  tenantId: string
): Promise<ResolutionContext | null> {
  const db = getDb();

  // Get user's membership in this tenant
  const membershipDoc = await db
    .collection('memberships')
    .doc(`${uid}_${tenantId}`)
    .get();

  if (!membershipDoc.exists) {
    logger.warn('User has no membership in tenant', { uid, tenantId });
    return null;
  }

  const membership = membershipDoc.data()!;

  return {
    requesterUid: uid,
    tenantId,
    teamIds: membership.teamIds || [],
  };
}
