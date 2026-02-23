/**
 * Structured Logging for Cloud Functions
 * 
 * JSON-formatted logs compatible with Google Cloud Logging
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  severity: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

/**
 * Create structured log entry
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  metadata: Record<string, any> = {}
): LogEntry {
  return {
    severity: level,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
}

/**
 * Log at DEBUG level
 */
export function debug(message: string, metadata: Record<string, any> = {}): void {
  const entry = createLogEntry('DEBUG', message, metadata);
  console.log(JSON.stringify(entry));
}

/**
 * Log at INFO level
 */
export function info(message: string, metadata: Record<string, any> = {}): void {
  const entry = createLogEntry('INFO', message, metadata);
  console.log(JSON.stringify(entry));
}

/**
 * Log at WARNING level
 */
export function warn(message: string, metadata: Record<string, any> = {}): void {
  const entry = createLogEntry('WARNING', message, metadata);
  console.warn(JSON.stringify(entry));
}

/**
 * Log at ERROR level
 */
export function error(message: string, error?: Error, metadata: Record<string, any> = {}): void {
  const entry = createLogEntry('ERROR', message, {
    ...metadata,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : undefined,
  });
  console.error(JSON.stringify(entry));
}

/**
 * Log at CRITICAL level
 */
export function critical(message: string, error?: Error, metadata: Record<string, any> = {}): void {
  const entry = createLogEntry('CRITICAL', message, {
    ...metadata,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : undefined,
  });
  console.error(JSON.stringify(entry));
}

/**
 * Log request start
 */
export function logRequest(
  method: string,
  path: string,
  metadata: Record<string, any> = {}
): void {
  info('Request received', {
    ...metadata,
    http: {
      method,
      path,
    },
  });
}

/**
 * Log request completion
 */
export function logRequestComplete(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  metadata: Record<string, any> = {}
): void {
  info('Request completed', {
    ...metadata,
    http: {
      method,
      path,
      statusCode,
      durationMs,
    },
  });
}

/**
 * Log query processing
 */
export function logQuery(
  clientId: string,
  query: string,
  metadata: Record<string, any> = {}
): void {
  info('Processing query', {
    ...metadata,
    clientId,
    queryLength: query.length,
  });
}

/**
 * Log query result
 */
export function logQueryResult(
  clientId: string,
  confidence: number,
  escalated: boolean,
  durationMs: number,
  metadata: Record<string, any> = {}
): void {
  info('Query processed', {
    ...metadata,
    clientId,
    confidence,
    escalated,
    durationMs,
  });
}

/**
 * Log escalation created
 */
export function logEscalation(
  escalationId: string,
  clientId: string,
  metadata: Record<string, any> = {}
): void {
  info('Escalation created', {
    ...metadata,
    escalationId,
    clientId,
  });
}

/**
 * Log notification sent
 */
export function logNotification(
  channel: string,
  success: boolean,
  metadata: Record<string, any> = {}
): void {
  if (success) {
    info('Notification sent', {
      ...metadata,
      channel,
    });
  } else {
    warn('Notification failed', {
      ...metadata,
      channel,
    });
  }
}
