const AuditLog = require('../models/AuditLog');

const sanitizeBody = (body) => {
  if (!body) return body;
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'apiKey', 'apiSecret'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) sanitized[field] = '********';
  });
  return sanitized;
};

const auditLogger = (action, resource) => {
  return async (req, res, next) => {
    // We'll log AFTER the response is sent successfully
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const log = new AuditLog({
            adminId: req.user.id,
            action,
            resource,
            resourceId: req.params.id || req.body.id || req.body.orderId || req.body.gameId,
            details: {
              method: req.method,
              url: req.originalUrl,
              body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
          await log.save();
        } catch (err) {
          console.error('[AuditLogger] Failed to save log:', err.message);
        }
      }
    });
    next();
  };
};

module.exports = auditLogger;