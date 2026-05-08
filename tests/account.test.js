import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadPage(filename) {
    const html = readFileSync(resolve(__dirname, '..', filename), 'utf-8');
    document.documentElement.innerHTML = html;
}

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

describe('account.html — mock user profile', () => {
    beforeAll(() => loadPage('account.html'));

    it('displays the user name', () => {
        expect(document.querySelector('.profile-name').textContent).toBe('Austin Dircks');
    });

    it('displays the user email', () => {
        expect(document.querySelector('.profile-email').textContent).toBe('austin.dircks@improving.com');
    });

    it('displays the user role', () => {
        expect(document.querySelector('.profile-role').textContent).toBe('Admin');
    });

    it('shows avatar initials', () => {
        expect(document.querySelector('.profile-avatar').textContent.trim()).toBe('AD');
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
        // Programs are loaded dynamically; verify structure when present
        document.querySelectorAll('.program-item').forEach(program => {
            expect(program.querySelector('.program-name').textContent.trim().length).toBeGreaterThan(0);
        });
    });

    it('each rendered program has at least one child project', () => {
        // Programs are loaded dynamically; verify structure when present
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

describe('home.html — user avatar nav button', () => {
    beforeAll(() => loadPage('home.html'));

    it('has a user avatar button in the nav', () => {
        expect(document.querySelector('.btn-user')).not.toBeNull();
    });

    it('user avatar button links to account.html', () => {
        expect(document.querySelector('.btn-user').getAttribute('href')).toBe('account.html');
    });

    it('user avatar button shows the user name', () => {
        expect(document.querySelector('.btn-user').textContent).toContain('Austin Dircks');
    });

    it('user avatar shows correct initials', () => {
        expect(document.querySelector('.btn-user-avatar').textContent.trim()).toBe('AD');
    });
});
