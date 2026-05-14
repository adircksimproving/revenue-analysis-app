import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getInitials, loadUserButton } from '../js/user.js';

function loadPage(filename) {
    const html = readFileSync(resolve(__dirname, '..', filename), 'utf-8');
    document.documentElement.innerHTML = html;
}

// ── getInitials ───────────────────────────────────────────────────────────────

describe('getInitials', () => {
    it('returns first letter of each word, up to 2', () => {
        expect(getInitials('Austin Dircks')).toBe('AD');
    });

    it('only uses first two words when name has three or more', () => {
        expect(getInitials('Austin James Dircks')).toBe('AJ');
    });

    it('handles a single word', () => {
        expect(getInitials('Austin')).toBe('A');
    });

    it('returns ? for empty string', () => {
        expect(getInitials('')).toBe('?');
    });

    it('returns ? for null/undefined', () => {
        expect(getInitials(null)).toBe('?');
        expect(getInitials(undefined)).toBe('?');
    });

    it('uppercases initials regardless of input case', () => {
        expect(getInitials('austin dircks')).toBe('AD');
    });

    it('handles extra whitespace between words', () => {
        expect(getInitials('  Austin   Dircks  ')).toBe('AD');
    });
});

// ── loadUserButton ────────────────────────────────────────────────────────────

describe('loadUserButton — populates btn-user from /api/me', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <a href="account.html" class="btn-user">
                <div class="btn-user-avatar"></div>
                <span class="btn-user-name"></span>
            </a>`;
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sets the display name from me.name', async () => {
        fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ id: 1, name: 'Austin Dircks', email: 'austin.dircks@improving.com', isAdmin: true }),
        });
        await loadUserButton();
        expect(document.querySelector('.btn-user-name').textContent).toBe('Austin Dircks');
    });

    it('sets avatar initials derived from me.name', async () => {
        fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ id: 1, name: 'Austin Dircks', email: 'austin.dircks@improving.com', isAdmin: true }),
        });
        await loadUserButton();
        expect(document.querySelector('.btn-user-avatar').textContent).toBe('AD');
    });

    it('falls back to email when name is absent', async () => {
        fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ id: 1, name: null, email: 'austin.dircks@improving.com', isAdmin: false }),
        });
        await loadUserButton();
        expect(document.querySelector('.btn-user-name').textContent).toBe('austin.dircks@improving.com');
    });

    it('does not throw when .btn-user is absent from the page', async () => {
        document.body.innerHTML = '';
        fetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ id: 1, name: 'Austin Dircks', email: 'austin.dircks@improving.com', isAdmin: true }),
        });
        await expect(loadUserButton()).resolves.toBeUndefined();
    });
});

// ── account.html ─────────────────────────────────────────────────────────────

describe('account.html — required sections', () => {
    beforeAll(() => loadPage('account.html'));

    it('has a General Information section', () => {
        const labels = [...document.querySelectorAll('.section-label')].map(el => el.textContent);
        expect(labels.some(t => /general information/i.test(t))).toBe(true);
    });

    it('has a Settings section', () => {
        const labels = [...document.querySelectorAll('.section-label')].map(el => el.textContent);
        expect(labels.some(t => /settings/i.test(t))).toBe(true);
    });

    it('has a Programs & Clients section', () => {
        const labels = [...document.querySelectorAll('.section-label')].map(el => el.textContent);
        expect(labels.some(t => /programs/i.test(t))).toBe(true);
    });

    it('has an Invite New Users section', () => {
        const labels = [...document.querySelectorAll('.section-label')].map(el => el.textContent);
        expect(labels.some(t => /invite/i.test(t))).toBe(true);
    });
});

describe('account.html — profile DOM structure', () => {
    beforeAll(() => loadPage('account.html'));

    it('has a .profile-name element ready for dynamic population', () => {
        expect(document.querySelector('.profile-name')).not.toBeNull();
    });

    it('has a .profile-email element ready for dynamic population', () => {
        expect(document.querySelector('.profile-email')).not.toBeNull();
    });

    it('has a .profile-role element ready for dynamic population', () => {
        expect(document.querySelector('.profile-role')).not.toBeNull();
    });

    it('has a .profile-avatar element ready for dynamic population', () => {
        expect(document.querySelector('.profile-avatar')).not.toBeNull();
    });
});

describe('account.html — programs and projects', () => {
    beforeAll(() => loadPage('account.html'));

    it('has a clients list container', () => {
        expect(document.querySelector('#clientsList')).not.toBeNull();
    });

    it('clients list container is inside the Programs & Clients section', () => {
        const card = document.querySelector('#clientsList').closest('.account-card');
        expect(card).not.toBeNull();
    });

    it('each rendered program has a name', () => {
        document.querySelectorAll('.program-item').forEach(program => {
            expect(program.querySelector('.program-name').textContent.trim().length).toBeGreaterThan(0);
        });
    });

    it('each rendered program has at least one child project', () => {
        document.querySelectorAll('.program-item').forEach(program => {
            expect(program.querySelectorAll('.project-item').length).toBeGreaterThanOrEqual(1);
        });
    });
});

describe('account.html — placeholders', () => {
    beforeAll(() => loadPage('account.html'));

    it('settings section has a placeholder message', () => {
        expect(document.querySelector('.placeholder-message')).not.toBeNull();
    });

    it('invite section has a placeholder', () => {
        expect(document.querySelector('.invite-placeholder')).not.toBeNull();
    });
});

describe('account.html — navigation', () => {
    beforeAll(() => loadPage('account.html'));

    it('brand logo links to portal dashboard', () => {
        const brand = document.querySelector('.nav-brand');
        expect(brand.getAttribute('href')).toBe('/portal');
    });

    it('sign out link points to /auth/logout', () => {
        const signout = [...document.querySelectorAll('.btn-signout')]
            .find(a => a.textContent.trim() === 'Sign out');
        expect(signout?.getAttribute('href')).toBe('/auth/logout');
    });
});

// ── home.html — nav additions ────────────────────────────────────────────────

describe('home.html — user avatar nav button structure', () => {
    beforeAll(() => loadPage('home.html'));

    it('has a user avatar button in the nav', () => {
        expect(document.querySelector('.btn-user')).not.toBeNull();
    });

    it('user avatar button links to account.html', () => {
        expect(document.querySelector('.btn-user').getAttribute('href')).toBe('account.html');
    });

    it('has a .btn-user-avatar element ready for dynamic population', () => {
        expect(document.querySelector('.btn-user-avatar')).not.toBeNull();
    });

    it('has a .btn-user-name element ready for dynamic population', () => {
        expect(document.querySelector('.btn-user-name')).not.toBeNull();
    });
});
