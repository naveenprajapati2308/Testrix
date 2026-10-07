import jwt from 'jsonwebtoken';

const secret = process.env.PORTAL_JWT_SECRET;
if (!secret) {
    throw new Error('PORTAL_JWT_SECRET must be set — no insecure fallback');
}

// automation-portal issues the token at login; this service only validates signature +
// expiry with the same shared secret, same as api-testing's/performance-testing's
// JwtValidationFilter — there's no local user store here to look anything else up against.
//
// The decoded claims (and the raw token) are attached to req.auth so downstream tool calls
// to the other backends can forward this same user's token — never a service credential —
// which is what makes those backends' own project-scoping apply automatically here too.
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing or invalid authentication token' });
    }
    const token = header.substring(7);
    try {
        const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
        req.auth = {
            token,
            username: payload.sub,
            projectId: payload.projectId ?? null,
            tenantId: payload.tenantId ?? null,
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Missing or invalid authentication token' });
    }
}
