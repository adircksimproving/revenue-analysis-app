import { randomBytes } from 'crypto';
import db from '../db.js';

const PORTAL_URL = process.env.PORTAL_URL || 'http://localhost:3001';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sessions = new Map();

// portal.username is the email address; derive a display name from the local part.
// e.g. "austin.dircks@improving.com" → "Austin Dircks"
function deriveName(email) {
    const local = String(email || '').split('@')[0];
    return local.split(/[.\-_]+/).filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ') || email;
}

const upsertUser = db.prepare(`
    INSERT INTO users (portal_user_id, email, name, role)
    VALUES (?, ?, ?, 'user')
    ON CONFLICT(portal_user_id) DO UPDATE SET email = excluded.email, name = excluded.name
`);
const findUserByPortalId = db.prepare('SELECT id FROM users WHERE portal_user_id = ?');

function readCookie(req, name) {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(';')) {
        const [k, v] = part.trim().split('=');
        if (k === name) return v;
    }
    return null;
}

function appBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    return `${proto}://${req.headers.host}`;
}

function unauthenticated(req, res) {
    if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api')) {
        return res.status(401).json({ error: 'unauthenticated' });
    }
    return res.redirect('/auth/portal');
}

function createLocalSession({ localUserId, portalUserId, username, firstName, lastName, name, isAdmin }) {
    const sid = randomBytes(32).toString('hex');
    sessions.set(sid, {
        localUserId,
        portalUserId,
        username,
        firstName,
        lastName,
        name,
        isAdmin,
        expires: Date.now() + SESSION_TTL_MS,
    });
    return sid;
}

function getLocalSession(sid) {
    if (!sid) return null;
    const s = sessions.get(sid);
    if (!s) return null;
    if (s.expires < Date.now()) {
        sessions.delete(sid);
        return null;
    }
    return s;
}

function destroyLocalSession(sid) {
    if (sid) sessions.delete(sid);
}

export function updateSessionName(req, firstName, lastName) {
    const sid = readCookie(req, 'rev_sid');
    const s = getLocalSession(sid);
    if (!s) return;
    s.firstName = firstName;
    s.lastName = lastName;
    s.name = `${firstName} ${lastName}`.trim() || s.name;
}

const cookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
});

export function requirePortalAuth(req, res, next) {
    const sid = readCookie(req, 'rev_sid');
    const session = getLocalSession(sid);
    if (!session) return unauthenticated(req, res);

    req.userId = session.localUserId;
    req.user = {
        id: session.localUserId,
        portalUserId: session.portalUserId,
        username: session.username,
        email: session.username,
        firstName: session.firstName,
        lastName: session.lastName,
        name: session.name,
        isAdmin: session.isAdmin,
    };
    next();
}

// Kicks the browser over to portal's handoff endpoint with our callback URL.
export function startHandoff(req, res) {
    const next = typeof req.query.next === 'string' ? req.query.next : '/home.html';
    const callback = `${appBaseUrl(req)}/auth/callback?next=${encodeURIComponent(next)}`;
    res.redirect(`${PORTAL_URL}/auth/handoff?return=${encodeURIComponent(callback)}`);
}

// Receives ?portal_token= back from portal, exchanges it server-to-server,
// upserts the local user, and issues the rev_sid cookie.
export async function handleCallback(req, res) {
    const token = typeof req.query.portal_token === 'string' ? req.query.portal_token : null;
    if (!token) return res.status(400).send('Missing portal_token');

    let portalUser;
    try {
        const exchange = await fetch(`${PORTAL_URL}/api/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        if (!exchange.ok) return res.redirect('/auth/portal');
        portalUser = await exchange.json();
    } catch (err) {
        console.error('Token exchange failed:', err.message);
        return res.status(502).send('Auth exchange failed');
    }

    const firstName = portalUser.firstName || '';
    const lastName = portalUser.lastName || '';
    const displayName = (firstName && lastName)
        ? `${firstName} ${lastName}`
        : deriveName(portalUser.username);
    upsertUser.run(portalUser.id, portalUser.username, displayName);
    const local = findUserByPortalId.get(portalUser.id);

    const sid = createLocalSession({
        localUserId: local.id,
        portalUserId: portalUser.id,
        username: portalUser.username,
        firstName,
        lastName,
        name: displayName,
        isAdmin: !!portalUser.is_admin,
    });
    res.cookie('rev_sid', sid, cookieOptions());

    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/')
        ? req.query.next
        : '/home.html';
    res.redirect(next);
}

export function handleLogout(req, res) {
    const sid = readCookie(req, 'rev_sid');
    destroyLocalSession(sid);
    res.clearCookie('rev_sid', { path: '/' });
    res.redirect(`${PORTAL_URL}/auth/logout`);
}
