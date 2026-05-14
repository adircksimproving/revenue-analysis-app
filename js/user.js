export function getInitials(name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2)
        .map(p => p[0].toUpperCase()).join('') || '?';
}

export async function loadUserButton() {
    try {
        const res = await fetch('/api/me');
        if (res.status === 401) {
            window.location.href = '/auth/portal';
            return;
        }
        if (!res.ok) return;
        const me = await res.json();

        const btn = document.querySelector('.btn-user');
        if (!btn) return;
        const avatar = btn.querySelector('.btn-user-avatar');
        const nameEl = btn.querySelector('.btn-user-name');
        const displayName = me.name || me.email || '';
        if (avatar) avatar.textContent = getInitials(displayName);
        if (nameEl) nameEl.textContent = displayName;
    } catch {}
}
