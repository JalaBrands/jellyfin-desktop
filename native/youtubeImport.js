// YouTube Playlist Import for Jellyfin Desktop
// Uses yt-dlp (no API key needed) to read public playlists.
// Two modes:
//   Match - find playlist tracks already in your Jellyfin library
//   Download - download audio files into a folder Jellyfin can scan

(function () {
    'use strict';

    const PANEL_ID = 'jmp-yt-import-panel';
    const BTN_ID   = 'jmp-yt-import-btn';
    const ARTIST_MATCH_THRESHOLD = 0.45;

    // -------------------------------------------------------------------------
    // Styles
    // -------------------------------------------------------------------------
    const css = `
#${PANEL_ID}-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    z-index: 99998;
    display: flex;
    align-items: center;
    justify-content: center;
}
#${PANEL_ID} {
    background: #1c1c1c;
    border-radius: 12px;
    width: min(700px, 95vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    padding: 26px 30px 22px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.7);
    color: #e0e0e0;
    font-family: inherit;
    overflow: hidden;
    gap: 0;
}
#${PANEL_ID} h2 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 700;
    color: #fff;
}
#${PANEL_ID} .subtitle {
    font-size: 13px;
    color: #666;
    margin: 0 0 16px;
}
#${PANEL_ID} .mode-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 18px;
    border: 1px solid #333;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
}
#${PANEL_ID} .mode-tab {
    flex: 1;
    padding: 9px 12px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: #222;
    color: #888;
    border: none;
    font-family: inherit;
    transition: background 0.15s, color 0.15s;
}
#${PANEL_ID} .mode-tab.active { background: #ff0000; color: #fff; }
#${PANEL_ID} .mode-tab:first-child { border-right: 1px solid #333; }
#${PANEL_ID} .field-group { margin-bottom: 12px; }
#${PANEL_ID} .field-label {
    display: block;
    font-size: 11px;
    color: #666;
    margin-bottom: 4px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
#${PANEL_ID} input[type="text"],
#${PANEL_ID} input[type="password"] {
    width: 100%;
    background: #252525;
    border: 1px solid #3a3a3a;
    border-radius: 7px;
    color: #e0e0e0;
    padding: 9px 11px;
    font-size: 14px;
    font-family: inherit;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.2s;
}
#${PANEL_ID} input:focus { border-color: #ff0000; }
#${PANEL_ID} select {
    background: #252525;
    border: 1px solid #3a3a3a;
    border-radius: 7px;
    color: #e0e0e0;
    padding: 9px 11px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
}
#${PANEL_ID} .row { display: flex; gap: 10px; align-items: flex-end; }
#${PANEL_ID} .row .field-group { flex: 1; margin-bottom: 0; }
#${PANEL_ID} .btn-browse {
    background: #333;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 7px;
    padding: 9px 14px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    flex-shrink: 0;
    transition: background 0.15s;
}
#${PANEL_ID} .btn-browse:hover { background: #444; color: #fff; }
#${PANEL_ID} .status {
    margin-top: 10px;
    font-size: 13px;
    min-height: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex-shrink: 0;
}
#${PANEL_ID} .status.error { color: #f55; }
#${PANEL_ID} .status.success { color: #4d4; }
#${PANEL_ID} .spinner {
    width: 15px; height: 15px;
    border: 2px solid #444;
    border-top-color: #ff0000;
    border-radius: 50%;
    animation: jmp-yt-spin 0.8s linear infinite;
    flex-shrink: 0;
}
@keyframes jmp-yt-spin { to { transform: rotate(360deg); } }

/* Results table */
#${PANEL_ID} .results-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    margin-top: 10px;
    overflow: hidden;
}
#${PANEL_ID} .summary-bar {
    font-size: 13px;
    color: #888;
    padding: 4px 0 8px;
    flex-shrink: 0;
}
#${PANEL_ID} .summary-bar strong { color: #ddd; }
#${PANEL_ID} .results-scroll {
    overflow-y: auto;
    flex: 1;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    background: #141414;
}
#${PANEL_ID} .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}
#${PANEL_ID} .results-table th {
    position: sticky;
    top: 0;
    background: #1e1e1e;
    color: #666;
    text-align: left;
    padding: 6px 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid #2a2a2a;
}
#${PANEL_ID} .results-table td {
    padding: 5px 9px;
    border-bottom: 1px solid #1e1e1e;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
#${PANEL_ID} tr.matched td { color: #ccc; }
#${PANEL_ID} tr.unmatched td { color: #444; }
#${PANEL_ID} .badge {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
}
#${PANEL_ID} .badge-found   { background: #1a3d1a; color: #5d5; }
#${PANEL_ID} .badge-missing { background: #2a1515; color: #844; }
#${PANEL_ID} .badge-done    { background: #1a2d1a; color: #5d5; }
#${PANEL_ID} .badge-error   { background: #2a1515; color: #f55; }
#${PANEL_ID} .badge-pending { background: #252525; color: #666; }

/* Download log */
#${PANEL_ID} .dl-log {
    flex: 1;
    min-height: 100px;
    background: #0e0e0e;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    overflow-y: auto;
    font-size: 11px;
    font-family: monospace;
    padding: 8px 10px;
    color: #888;
    margin-top: 10px;
    white-space: pre-wrap;
    word-break: break-all;
}
#${PANEL_ID} .dl-log .log-done   { color: #5d5; }
#${PANEL_ID} .dl-log .log-error  { color: #f55; }
#${PANEL_ID} .dl-log .log-info   { color: #5af; }

/* Playlist name row */
#${PANEL_ID} .name-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    flex-shrink: 0;
}
#${PANEL_ID} .name-row .field-label { margin: 0; white-space: nowrap; }
#${PANEL_ID} .name-row input { flex: 1; }

/* Button row */
#${PANEL_ID} .btn-row {
    margin-top: 14px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-shrink: 0;
}
#${PANEL_ID} .btn-primary {
    background: #ff0000;
    color: #fff;
    border: none;
    border-radius: 7px;
    padding: 10px 22px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    font-family: inherit;
}
#${PANEL_ID} .btn-primary:hover:not(:disabled) { background: #cc0000; }
#${PANEL_ID} .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
#${PANEL_ID} .btn-secondary {
    background: #2a2a2a;
    color: #bbb;
    border: 1px solid #3a3a3a;
    border-radius: 7px;
    padding: 10px 18px;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
}
#${PANEL_ID} .btn-secondary:hover:not(:disabled) { background: #333; color: #fff; }
#${PANEL_ID} .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
#${PANEL_ID} .btn-cancel {
    background: transparent;
    color: #666;
    border: 1px solid #333;
    border-radius: 7px;
    padding: 10px 18px;
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, border-color 0.15s;
}
#${PANEL_ID} .btn-cancel:hover { color: #ccc; border-color: #666; }
`;

    function injectStyles() {
        if (document.getElementById('jmp-yt-styles')) return;
        const el = document.createElement('style');
        el.id = 'jmp-yt-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    // -------------------------------------------------------------------------
    // Title cleaning & Jellyfin matching
    // -------------------------------------------------------------------------
    const JUNK_RE = [
        /\(official\s*(music\s*)?video\)/gi,
        /\(official\s*(audio|lyric|visualizer|performance|hd)\)/gi,
        /\(official\)/gi,
        /\[official\s*(music\s*)?video\]/gi,
        /\[official\s*(audio|lyric|visualizer)\]/gi,
        /\(lyrics?\s*(video)?\)/gi,
        /\[lyrics?\s*(video)?\]/gi,
        /\(full\s*song\)/gi,
        /[\(\[](hd|4k|official|audio|lyric|visualizer)[\)\]]/gi,
        /\s*\bft\.?\s+[^()[\],]+/gi,
        /\s*\bfeat\.?\s+[^()[\],]+/gi,
        /\s*-\s*(official\s*(music\s*)?video|lyric video|audio|hd)\s*$/gi,
    ];

    function cleanTitle(raw) {
        // "Artist - Song Title" split
        let artist = '';
        let title = raw;
        const dash = raw.indexOf(' - ');
        if (dash > 0 && dash < 60) {
            artist = raw.slice(0, dash).trim();
            title  = raw.slice(dash + 3).trim();
        }
        for (const re of JUNK_RE) title = title.replace(re, '').trim();
        title = title.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').trim();
        return { title, parsedArtist: artist };
    }

    function tokenSimilarity(a, b) {
        const tok = s => new Set(normalizeTrackText(s).split(/\s+/).filter(Boolean));
        const ta = tok(a); const tb = tok(b);
        if (!ta.size || !tb.size) return 0;
        let hits = 0; tb.forEach(t => { if (ta.has(t)) hits++; });
        return hits / Math.max(ta.size, tb.size);
    }

    function normalizeTrackText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/&/g, ' and ')
            .replace(/\b(feat|ft|featuring)\b\.?/gi, ' ')
            .replace(/\b(remaster(ed)?|explicit|clean|mono|stereo|single|album|version|radio|edit|official|audio|video|lyrics?|visualizer|hd|4k)\b/gi, ' ')
            .replace(/[()[\]{}'"`]/g, ' ')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function levenshteinRatio(a, b) {
        a = normalizeTrackText(a);
        b = normalizeTrackText(b);
        if (!a || !b) return 0;
        if (a === b) return 1;

        const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
        const current = new Array(b.length + 1);
        for (let i = 1; i <= a.length; i++) {
            current[0] = i;
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                current[j] = Math.min(
                    current[j - 1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + cost
                );
            }
            for (let j = 0; j <= b.length; j++) previous[j] = current[j];
        }
        const distance = previous[b.length];
        return 1 - (distance / Math.max(a.length, b.length));
    }

    function uniqueValues(values) {
        return [...new Set(values.map(v => (v || '').trim()).filter(Boolean))];
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function searchTermsForTrack(title, artist) {
        const simpleTitle = title
            .replace(/[()[\]{}]/g, ' ')
            .replace(/\b(remaster(ed)?|explicit|clean|mono|stereo|single|album version)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const coreWords = simpleTitle.split(/\s+/).filter(w => w.length > 2).slice(0, 5).join(' ');

        return uniqueValues(artist
            ? [`${title} ${artist}`, `${artist} ${title}`, title, simpleTitle, `${coreWords} ${artist}`]
            : [title, simpleTitle, coreWords]);
    }

    function jellyfinArtists(item) {
        return [item.AlbumArtist, ...(item.Artists || [])].filter(Boolean);
    }

    function hasUsefulArtistHint(artist) {
        return normalizeTrackText(artist).length >= 3;
    }

    function artistSimilarity(artist, artists) {
        if (!hasUsefulArtistHint(artist)) return 1;
        if (!artists.length) return 0;

        const normalizedArtist = normalizeTrackText(artist);
        return Math.max(...artists.map(a => {
            const normalizedCandidate = normalizeTrackText(a);
            const containsScore = normalizedArtist.length >= 4 && normalizedCandidate.length >= 4 &&
                (normalizedArtist.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedArtist)) ? 0.9 : 0;

            return Math.max(
                tokenSimilarity(artist, a),
                levenshteinRatio(artist, a),
                containsScore
            );
        }));
    }

    let audioLibraryCache = null;

    async function fetchAudioLibraryPool() {
        if (audioLibraryCache) return audioLibraryCache;

        const ac = window.ApiClient;
        if (!ac) return [];
        const userId = ac.getCurrentUserId();
        const serverAddress = ac.serverAddress();
        const token = ac.accessToken();

        const items = [];
        const pageSize = 1000;
        for (let start = 0; start < 20000; start += pageSize) {
            const url = new URL(`${serverAddress}/Items`);
            url.searchParams.set('IncludeItemTypes', 'Audio');
            url.searchParams.set('Recursive', 'true');
            url.searchParams.set('StartIndex', String(start));
            url.searchParams.set('Limit', String(pageSize));
            url.searchParams.set('Fields', 'AlbumArtist,Artists,Album,ProductionYear');
            url.searchParams.set('SortBy', 'SortName');
            url.searchParams.set('userId', userId);

            try {
                const res = await fetch(url.toString(), { headers: { 'X-Emby-Token': token } });
                if (!res.ok) break;
                const data = await res.json();
                const page = data.Items || [];
                items.push(...page);
                if (page.length < pageSize) break;
            } catch (err) {
                console.warn('YouTube import: failed to fetch audio library pool', err);
                break;
            }
        }

        console.log(`YouTube import: cached ${items.length} Jellyfin audio tracks for fuzzy matching`);
        audioLibraryCache = items;
        return audioLibraryCache;
    }

    function scoreJellyfinCandidate(title, artist, item) {
        const itemTitle = item.Name || '';
        const artists = jellyfinArtists(item);
        const titleToken = tokenSimilarity(title, itemTitle);
        const titleRatio = levenshteinRatio(title, itemTitle);
        const normalizedTitle = normalizeTrackText(title);
        const normalizedItemTitle = normalizeTrackText(itemTitle);
        const titleContains = normalizedTitle && normalizedItemTitle && normalizedItemTitle.length >= 8 &&
            (normalizedTitle.includes(normalizedItemTitle) || normalizedItemTitle.includes(normalizedTitle)) ? 1 : 0;
        const titleScore = Math.max(titleToken, titleRatio, titleContains);
        const artistRequired = hasUsefulArtistHint(artist);
        const artistScore = artistSimilarity(artist, artists);
        const artistCompatible = !artistRequired || artistScore >= ARTIST_MATCH_THRESHOLD;
        const rawScore = Math.max(titleToken, titleRatio * 0.95, titleContains * 0.9) * 0.72 + artistScore * 0.28;
        const score = artistCompatible ? rawScore : Math.min(rawScore, 0.49);

        return { item, score, titleScore, artistScore, artistRequired, artistCompatible };
    }

    function topFuzzyCandidates(title, artist, pool, limit = 24) {
        return pool
            .map(item => scoreJellyfinCandidate(title, artist, item))
            .filter(row => row.artistCompatible && (row.titleScore >= 0.32 || row.score >= 0.42))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(row => row.item);
    }

    async function fetchJellyfinCandidates(title, artist) {
        const ac = window.ApiClient;
        if (!ac) return [];
        const userId = ac.getCurrentUserId();
        const serverAddress = ac.serverAddress();
        const token = ac.accessToken();

        const byId = new Map();
        const queries = searchTermsForTrack(title, artist);
        for (const q of queries) {
            const url = new URL(`${serverAddress}/Items`);
            url.searchParams.set('searchTerm', q);
            url.searchParams.set('IncludeItemTypes', 'Audio');
            url.searchParams.set('Recursive', 'true');
            url.searchParams.set('Limit', '30');
            url.searchParams.set('Fields', 'AlbumArtist,Artists');
            url.searchParams.set('userId', userId);

            try {
                const res = await fetch(url.toString(), { headers: { 'X-Emby-Token': token } });
                if (!res.ok) continue;
                const data = await res.json();
                for (const item of data.Items || []) byId.set(item.Id, item);
            } catch (_) {}
        }

        const serverCandidates = [...byId.values()];
        if (serverCandidates.length >= 8) return serverCandidates;

        const fuzzyCandidates = topFuzzyCandidates(title, artist, await fetchAudioLibraryPool());
        for (const item of fuzzyCandidates) byId.set(item.Id, item);
        const combined = [...byId.values()];
        console.log(`YouTube import: "${title}" has ${serverCandidates.length} Jellyfin search candidates, ${combined.length} after fuzzy library scan`);
        return combined;
    }

    async function judgeJellyfinMatchWithAi(rawTitle, cleanedTitle, artist, candidates) {
        if (!candidates.length) return null;

        let api;
        try { api = await window.apiPromise; } catch (err) {
            console.warn('YouTube import: AI match skipped because native API is unavailable', err);
            return null;
        }
        if (!api || !api.ai || !api.ai.judgeTrackMatch) {
            console.warn('YouTube import: AI match skipped because AI bridge is unavailable');
            return null;
        }

        const rankedRows = candidates
            .map(item => scoreJellyfinCandidate(cleanedTitle, artist, item))
            .filter(row => row.artistCompatible)
            .sort((a, b) => b.score - a.score)
            .slice(0, 14);
        const rankedCandidates = rankedRows.map(row => row.item);

        if (!rankedCandidates.length) {
            console.log(`YouTube import: AI skipped "${rawTitle}" because no candidates matched artist "${artist || ''}"`);
            return null;
        }

        const payloadCandidates = rankedCandidates.map((item, index) => ({
            index,
            name: item.Name || '',
            artists: jellyfinArtists(item),
            album: item.Album || '',
            year: item.ProductionYear || null,
        }));

        console.log(`YouTube import: asking AI to judge "${rawTitle}" against ${payloadCandidates.length} candidates`);

        return await new Promise(resolve => {
            let done = false;
            const cleanup = () => {
                try { api.ai.trackMatchReady.disconnect(onReady); } catch (_) {}
                try { api.ai.trackMatchError.disconnect(onError); } catch (_) {}
            };
            const finish = value => {
                if (done) return;
                done = true;
                cleanup();
                resolve(value);
            };
            const onReady = json => {
                try {
                    const verdict = JSON.parse(json);
                    const index = Number.isInteger(verdict.index) ? verdict.index : -1;
                    const confidence = Number(verdict.confidence || 0);
                    if (verdict.match && index >= 0 && payloadCandidates[index] && confidence >= 0.72) {
                        const matchedRow = rankedRows[index];
                        if (matchedRow?.artistRequired && !matchedRow.artistCompatible) {
                            console.log(`YouTube import: AI match rejected for "${rawTitle}" because artist did not match`);
                            finish(null);
                            return;
                        }
                        console.log(`YouTube import: AI matched "${rawTitle}" to "${rankedCandidates[index].Name}" at ${Math.round(confidence * 100)}%`);
                        finish({
                            item: rankedCandidates[index],
                            score: confidence,
                            ai: true,
                            reason: verdict.reason || ''
                        });
                    } else {
                        console.log(`YouTube import: AI rejected candidates for "${rawTitle}" at ${Math.round(confidence * 100)}%`);
                        finish(null);
                    }
                } catch (_) { finish(null); }
            };
            const onError = error => {
                console.warn('YouTube import: AI match error', error);
                finish(null);
            };

            api.ai.trackMatchReady.connect(onReady);
            api.ai.trackMatchError.connect(onError);
            window.setTimeout(() => finish(null), 20000);

            api.ai.judgeTrackMatch(JSON.stringify({
                rawTitle,
                cleanedTitle,
                artistHint: artist || ''
            }), JSON.stringify(payloadCandidates));
        });
    }

    async function searchJellyfin(title, artist, rawTitle) {
        const candidates = await fetchJellyfinCandidates(title, artist);
        if (!candidates.length) return null;

        const ranked = candidates
            .map(item => scoreJellyfinCandidate(title, artist, item))
            .sort((a, b) => b.score - a.score);
        const bestRow = ranked[0] || null;
        const best = bestRow?.item || null;
        const bestScore = bestRow?.score || 0;
        const bestTitleScore = bestRow?.titleScore || 0;
        const bestArtistScore = bestRow?.artistScore || 0;

        if (bestRow?.artistRequired && !bestRow.artistCompatible) {
            console.log(`YouTube import: rejected "${rawTitle || title}" because best candidate artist did not match "${artist}"`);
            return null;
        }

        if (best && bestTitleScore >= 0.78 && (!hasUsefulArtistHint(artist) || bestArtistScore >= ARTIST_MATCH_THRESHOLD))
            return { item: best, score: bestScore, ai: false };

        const aiMatch = await judgeJellyfinMatchWithAi(rawTitle || title, title, artist, ranked.map(row => row.item));
        if (aiMatch) return aiMatch;

        if (best && bestTitleScore >= 0.64 && bestScore >= 0.66 && (!hasUsefulArtistHint(artist) || bestArtistScore >= ARTIST_MATCH_THRESHOLD))
            return { item: best, score: bestScore, ai: false };

        return null;
    }

    async function createJellyfinPlaylist(name, itemIds) {
        const ac = window.ApiClient;
        const userId = ac.getCurrentUserId();
        const token = ac.accessToken();
        const res = await fetch(`${ac.serverAddress()}/Playlists`, {
            method: 'POST',
            headers: { 'X-Emby-Token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ Name: name, Ids: itemIds, UserId: userId, MediaType: 'Audio' })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async function fetchMusicLibraries() {
        const ac = window.ApiClient;
        if (!ac) return [];
        const token = ac.accessToken();
        try {
            const res = await fetch(`${ac.serverAddress()}/Library/VirtualFolders`, {
                headers: { 'X-Emby-Token': token }
            });
            if (!res.ok) return [];
            const folders = await res.json();
            return (folders || []).filter(f =>
                (f.CollectionType || '').toLowerCase() === 'music'
            );
        } catch (_) { return []; }
    }

    async function scanJellyfinLibrary(itemId) {
        const ac = window.ApiClient;
        const token = ac.accessToken();
        const endpoint = itemId
            ? `${ac.serverAddress()}/Items/${itemId}/Refresh`
            : `${ac.serverAddress()}/Library/Refresh`;
        await fetch(endpoint, {
            method: 'POST',
            headers: { 'X-Emby-Token': token }
        });
    }

    // -------------------------------------------------------------------------
    // Panel
    // -------------------------------------------------------------------------
    function createPanel() {
        const overlay = document.createElement('div');
        overlay.id = `${PANEL_ID}-overlay`;

        overlay.innerHTML = `
<div id="${PANEL_ID}">
  <h2>YouTube Import</h2>
  <p class="subtitle">Reads any public playlist via yt-dlp - no API key needed.</p>

  <div class="mode-tabs">
    <button class="mode-tab active" data-mode="match">Match in Library</button>
    <button class="mode-tab" data-mode="download">Download to Library</button>
  </div>

  <div class="field-group">
    <label class="field-label">YouTube Playlist URL</label>
    <input type="text" inputmode="url" id="jmp-yt-url" placeholder="https://www.youtube.com/playlist?list=PL..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
  </div>

  <!-- Download-only fields -->
  <div id="jmp-yt-dl-fields" style="display:none;">
    <div class="field-group">
      <label class="field-label">Jellyfin Music Library</label>
      <select id="jmp-yt-library"><option value="">Loading...</option></select>
    </div>
    <div class="field-group" style="margin-top:10px;">
      <label class="field-label">Local Download Folder <span style="font-weight:normal;color:#888;">(Mac path to that library)</span></label>
      <div class="row">
        <input type="text" id="jmp-yt-local-path" placeholder="Choose folder..." readonly />
        <button class="btn-browse" id="jmp-yt-browse">Browse...</button>
      </div>
    </div>
    <div class="field-group" style="margin-top:10px;">
      <label class="field-label">Audio Format</label>
      <select id="jmp-yt-format">
        <option value="mp3">MP3 (most compatible)</option>
        <option value="m4a">M4A / AAC (Apple)</option>
        <option value="flac">FLAC (lossless)</option>
        <option value="opus">Opus (efficient)</option>
        <option value="wav">WAV (uncompressed)</option>
      </select>
    </div>
  </div>

  <div class="status" id="jmp-yt-status"></div>

  <!-- Match results -->
  <div id="jmp-yt-match-results" class="results-wrap" style="display:none;">
    <div class="summary-bar" id="jmp-yt-summary"></div>
    <div class="results-scroll">
      <table class="results-table">
        <thead><tr>
          <th>#</th><th>YouTube Title</th><th>Artist / Channel</th><th>Library Match</th><th></th>
        </tr></thead>
        <tbody id="jmp-yt-tbody"></tbody>
      </table>
    </div>
    <div class="name-row">
      <label class="field-label">Playlist name</label>
      <input type="text" id="jmp-yt-plname" placeholder="My YouTube Playlist" />
    </div>
  </div>

  <!-- Download log -->
  <div id="jmp-yt-dl-results" class="results-wrap" style="display:none;">
    <div class="summary-bar" id="jmp-yt-dl-summary"></div>
    <div class="dl-log" id="jmp-yt-log"></div>
  </div>

  <div class="btn-row">
    <button class="btn-cancel" id="jmp-yt-cancel">Cancel</button>
    <button class="btn-secondary" id="jmp-yt-stop" style="display:none;">Stop</button>
    <button class="btn-secondary" id="jmp-yt-scan" style="display:none;">Scan Library</button>
    <button class="btn-primary" id="jmp-yt-action">Find Tracks</button>
  </div>
</div>`;

        document.body.appendChild(overlay);

        // Elements
        const statusEl    = overlay.querySelector('#jmp-yt-status');
        const actionBtn   = overlay.querySelector('#jmp-yt-action');
        const cancelBtn   = overlay.querySelector('#jmp-yt-cancel');
        const stopBtn     = overlay.querySelector('#jmp-yt-stop');
        const scanBtn     = overlay.querySelector('#jmp-yt-scan');
        const urlEl       = overlay.querySelector('#jmp-yt-url');
        const libSelectEl = overlay.querySelector('#jmp-yt-library');
        const localPathEl = overlay.querySelector('#jmp-yt-local-path');
        const browseBtn   = overlay.querySelector('#jmp-yt-browse');
        const formatEl    = overlay.querySelector('#jmp-yt-format');
        const dlFields    = overlay.querySelector('#jmp-yt-dl-fields');
        const matchRes    = overlay.querySelector('#jmp-yt-match-results');
        const dlRes       = overlay.querySelector('#jmp-yt-dl-results');
        const summaryEl   = overlay.querySelector('#jmp-yt-summary');
        const dlSummary   = overlay.querySelector('#jmp-yt-dl-summary');
        const tbody       = overlay.querySelector('#jmp-yt-tbody');
        const plNameEl    = overlay.querySelector('#jmp-yt-plname');
        const logEl       = overlay.querySelector('#jmp-yt-log');
        const modeTabs    = overlay.querySelectorAll('.mode-tab');

        let mode = 'match';
        let api  = null;
        let matchedItems  = [];
        let dlCompleted   = 0;
        let dlTotal       = 0;
        let musicLibraries = []; // [{name, itemId}]

        // ---- Populate Jellyfin library dropdown ----
        async function loadLibraries() {
            libSelectEl.innerHTML = '<option value="">Loading...</option>';
            const libs = await fetchMusicLibraries();
            musicLibraries = libs.map(l => ({ name: l.Name, itemId: l.ItemId }));
            if (!musicLibraries.length) {
                libSelectEl.innerHTML = '<option value="">No music libraries found</option>';
                return;
            }
            libSelectEl.innerHTML = musicLibraries.map((l, i) =>
                `<option value="${i}">${l.name}</option>`
            ).join('');
        }

        // ---- Browse for local folder ----
        browseBtn.addEventListener('click', async () => {
            if (!api) api = await getApi();
            const dir = await api.system.pickDirectory('Choose local folder for this music library');
            if (dir) localPathEl.value = dir;
        });

        // ---- Mode switching ----
        modeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                mode = tab.dataset.mode;
                modeTabs.forEach(t => t.classList.toggle('active', t === tab));
                dlFields.style.display    = mode === 'download' ? '' : 'none';
                matchRes.style.display    = 'none';
                dlRes.style.display       = 'none';
                statusEl.innerHTML        = '';
                actionState               = 'pending';
                actionBtn.textContent     = mode === 'match' ? 'Find Tracks' : 'Download';
                actionBtn.onclick         = null;
                stopBtn.style.display     = 'none';
                scanBtn.style.display     = 'none';
                if (mode === 'download' && !musicLibraries.length) loadLibraries();
            });
        });

        // ---- Status helpers ----
        function setStatus(msg, type) {
            if (!msg) { statusEl.innerHTML = ''; return; }
            const spin = type === 'loading' ? '<div class="spinner"></div>' : '';
            statusEl.className = `status${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
            statusEl.innerHTML = `${spin}<span>${escapeHtml(msg)}</span>`;
        }

        function close() {
            if (api) {
                try { api.system.ytDlpCancel(); } catch (_) {}
            }
            overlay.remove();
        }

        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        stopBtn.addEventListener('click', () => {
            if (api) try { api.system.ytDlpCancel(); } catch (_) {}
            stopBtn.style.display = 'none';
            setStatus('Stopped.', 'error');
            actionBtn.disabled = false;
        });

        scanBtn.addEventListener('click', async () => {
            scanBtn.disabled = true;
            scanBtn.textContent = 'Scanning...';
            const idx = parseInt(libSelectEl.value, 10);
            const lib = musicLibraries[idx];
            try {
                await scanJellyfinLibrary(lib ? lib.itemId : null);
                scanBtn.textContent = 'Scan started';
                setTimeout(() => { scanBtn.disabled = false; scanBtn.textContent = 'Scan Library'; }, 3000);
            } catch (err) {
                scanBtn.textContent = 'Scan failed';
                setTimeout(() => { scanBtn.disabled = false; scanBtn.textContent = 'Scan Library'; }, 3000);
            }
        });

        // ---- Get API bridge ----
        async function getApi() {
            if (api) return api;
            api = await window.apiPromise;
            return api;
        }

        // ---- Fetch playlist via yt-dlp ----
        function fetchPlaylist(url) {
            return new Promise((resolve, reject) => {
                let done = false;

                const onReady = jsonLines => {
                    if (done) return; done = true;
                    api.system.ytDlpPlaylistReady.disconnect(onReady);
                    api.system.ytDlpFailed.disconnect(onFail);
                    resolve(jsonLines);
                };
                const onFail = err => {
                    if (done) return; done = true;
                    api.system.ytDlpPlaylistReady.disconnect(onReady);
                    api.system.ytDlpFailed.disconnect(onFail);
                    reject(new Error(err));
                };

                api.system.ytDlpPlaylistReady.connect(onReady);
                api.system.ytDlpFailed.connect(onFail);
                api.system.ytDlpFetchPlaylist(url);
            });
        }

        // Parse yt-dlp JSONL output into track objects
        function parseJsonLines(jsonLines) {
            const tracks = [];
            for (const line of jsonLines.split('\n')) {
                const t = line.trim();
                if (!t) continue;
                try {
                    const obj = JSON.parse(t);
                    tracks.push({
                        title:    obj.title   || '',
                        channel:  obj.channel || obj.uploader || '',
                        videoId:  obj.id      || '',
                        playlistTitle: obj.playlist_title || obj.playlist || '',
                        position: obj.playlist_index ?? tracks.length + 1,
                    });
                } catch (_) {}
            }
            return tracks;
        }

        // ---- MATCH MODE ----
        async function doMatch() {
            const url = urlEl.value.trim();
            if (!url) { setStatus('Paste a YouTube playlist URL first.', 'error'); return; }

            actionState = 'pending';
            actionBtn.disabled = true;
            matchRes.style.display = 'none';
            dlRes.style.display    = 'none';
            tbody.innerHTML = '';
            matchedItems = [];
            stopBtn.style.display = '';

            setStatus('Running yt-dlp to fetch playlist...', 'loading');

            let jsonLines;
            try {
                jsonLines = await fetchPlaylist(url);
            } catch (err) {
                setStatus(err.message, 'error');
                actionBtn.disabled = false; stopBtn.style.display = 'none';
                return;
            }

            const tracks = parseJsonLines(jsonLines);
            if (!tracks.length) {
                setStatus('No tracks found. Is the playlist public?', 'error');
                actionBtn.disabled = false; stopBtn.style.display = 'none';
                return;
            }

            // Set default playlist name from playlist title
            if (!plNameEl.value && tracks[0].playlistTitle)
                plNameEl.value = tracks[0].playlistTitle;

            matchRes.style.display = 'flex';
            setStatus(`Matching ${tracks.length} tracks against your library...`, 'loading');

            let found = 0;
            for (let i = 0; i < tracks.length; i++) {
                const yt = tracks[i];
                const { title: cleanedTitle, parsedArtist } = cleanTitle(yt.title);
                const artistHint = parsedArtist ||
                    yt.channel.replace(/\s*-\s*Topic$/, '').replace(/VEVO$/i, '').trim();

                const match = await searchJellyfin(cleanedTitle || yt.title, artistHint, yt.title);

                const tr = document.createElement('tr');
                if (match) {
                    found++;
                    const jArtist = match.item.AlbumArtist || (match.item.Artists || [])[0] || '';
                    matchedItems.push({ jellyfinId: match.item.Id, jellyfinName: match.item.Name });
                    tr.className = 'matched';
                    const matchNote = match.ai
                        ? `AI match ${Math.round(match.score * 100)}%${match.reason ? `: ${match.reason}` : ''}`
                        : `Text match ${Math.round(match.score * 100)}%`;
                    tr.innerHTML = `
<td>${yt.position}</td>
<td title="${escapeHtml(yt.title)}">${escapeHtml(cleanedTitle || yt.title)}</td>
<td title="${escapeHtml(yt.channel)}">${escapeHtml(artistHint)}</td>
<td title="${escapeHtml(matchNote)}">${escapeHtml(match.item.Name)}${jArtist ? ` - ${escapeHtml(jArtist)}` : ''}</td>
<td><span class="badge badge-found">${match.ai ? 'AI' : 'Found'}</span></td>`;
                } else {
                    tr.className = 'unmatched';
                    tr.innerHTML = `
<td>${yt.position}</td>
<td title="${escapeHtml(yt.title)}">${escapeHtml(cleanedTitle || yt.title)}</td>
<td title="${escapeHtml(yt.channel)}">${escapeHtml(artistHint)}</td>
<td>-</td>
<td><span class="badge badge-missing">Not in library</span></td>`;
                }
                tbody.appendChild(tr);
                summaryEl.innerHTML = `Checked ${i + 1} / ${tracks.length} - <strong>${found} matched</strong>`;

                if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
            }

            stopBtn.style.display = 'none';
            setStatus('');
            summaryEl.innerHTML = `<strong>${found}</strong> of <strong>${tracks.length}</strong> tracks found in your library.`;

            if (!found) {
                setStatus('No tracks matched your library. Try downloading them instead.', 'error');
                actionBtn.disabled = false;
                return;
            }

            // Switch action button to Create Playlist
            actionState = 'create';
            actionBtn.textContent = `Create Playlist (${found} tracks)`;
            actionBtn.disabled = false;
        }

        async function doCreatePlaylist() {
            if (!matchedItems.length) return;
            const name = plNameEl.value.trim() || `YouTube Import ${new Date().toLocaleDateString()}`;
            actionBtn.disabled = true;
            setStatus('Creating playlist...', 'loading');
            try {
                const ids = matchedItems.map(m => m.jellyfinId);
                const result = await createJellyfinPlaylist(name, ids);
                setStatus(`"${name}" created with ${ids.length} tracks!`, 'success');
                setTimeout(() => {
                    overlay.remove();
                    if (result && result.Id && window.Emby && window.Emby.Page)
                        window.Emby.Page.show('details?id=' + result.Id);
                }, 1800);
            } catch (err) {
                setStatus('Could not create playlist: ' + err.message, 'error');
                actionBtn.disabled = false;
            }
        }

        // ---- DOWNLOAD MODE ----
        async function doDownload() {
            const url    = urlEl.value.trim();
            const format = formatEl.value;

            if (!url) { setStatus('Paste a YouTube playlist URL first.', 'error'); return; }

            const libIdx = parseInt(libSelectEl.value, 10);
            const lib    = isNaN(libIdx) ? null : musicLibraries[libIdx];
            if (!lib) {
                setStatus('Select a Jellyfin music library first.', 'error');
                return;
            }
            const folder = localPathEl.value.trim();
            if (!folder) {
                setStatus('Choose the local folder where this library is accessible on this Mac.', 'error');
                return;
            }

            actionBtn.disabled = true;
            dlCompleted = 0; dlTotal = 0;
            logEl.innerHTML = '';
            dlRes.style.display    = 'flex';
            matchRes.style.display = 'none';
            stopBtn.style.display  = '';
            scanBtn.style.display  = 'none';

            // Step 1: fetch playlist metadata
            setStatus('Fetching playlist info...', 'loading');
            let jsonLines;
            try {
                jsonLines = await fetchPlaylist(url);
            } catch (err) {
                setStatus(err.message, 'error');
                actionBtn.disabled = false; stopBtn.style.display = 'none';
                return;
            }
            const tracks = parseJsonLines(jsonLines);
            if (!tracks.length) {
                setStatus('No tracks found. Is the playlist public?', 'error');
                actionBtn.disabled = false; stopBtn.style.display = 'none';
                return;
            }
            if (!plNameEl.value && tracks[0]?.playlistTitle)
                plNameEl.value = tracks[0].playlistTitle;

            function appendLog(text, cls) {
                const span = document.createElement('span');
                if (cls) span.className = cls;
                span.textContent = text + '\n';
                logEl.appendChild(span);
                logEl.scrollTop = logEl.scrollHeight;
            }

            // Step 2: check library for each track
            setStatus(`Checking library for ${tracks.length} tracks...`, 'loading');
            dlSummary.innerHTML = `Checking 0 / ${tracks.length}...`;

            const toDownload = [];
            let alreadyHave = 0;

            for (let i = 0; i < tracks.length; i++) {
                const yt = tracks[i];
                const { title: cleanedTitle, parsedArtist } = cleanTitle(yt.title);
                const artistHint = parsedArtist ||
                    yt.channel.replace(/\s*-\s*Topic$/, '').replace(/VEVO$/i, '').trim();

                const match = await searchJellyfin(cleanedTitle || yt.title, artistHint, yt.title);
                if (match) {
                    alreadyHave++;
                    appendLog(`⏭ Already in library: ${cleanedTitle || yt.title}`, 'log-done');
                } else {
                    toDownload.push(`https://www.youtube.com/watch?v=${yt.videoId}`);
                }

                dlSummary.innerHTML = `Checked ${i + 1} / ${tracks.length} - <strong>${alreadyHave} already owned</strong>, ${toDownload.length} to download`;
                if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
            }

            if (!toDownload.length) {
                stopBtn.style.display = 'none';
                scanBtn.style.display = 'none';
                actionBtn.disabled = false;
                setStatus('All tracks are already in your library - nothing to download!', 'success');
                dlSummary.innerHTML = `<strong>${alreadyHave}</strong> tracks already owned.`;
                return;
            }

            appendLog(`\nDownloading ${toDownload.length} tracks (${alreadyHave} already in library, skipped)...\n`, 'log-info');
            dlTotal = toDownload.length;
            setStatus(`Downloading ${toDownload.length} tracks as ${format.toUpperCase()}...`, 'loading');
            dlSummary.innerHTML = `<strong>0</strong> / ${dlTotal} downloaded`;

            // Step 3: download only missing tracks
            const onProgress = line => {
                let cls = '';
                if (line.includes('[ExtractAudio] Destination')) {
                    dlCompleted++;
                    dlSummary.innerHTML = `<strong>${dlCompleted}</strong> / ${dlTotal} downloaded`;
                    cls = 'log-done';
                } else if (line.includes('100%')) {
                    cls = 'log-done';
                } else if (line.toLowerCase().includes('error')) {
                    cls = 'log-error';
                } else if (line.startsWith('[download]') || line.startsWith('[')) {
                    cls = 'log-info';
                }
                // Suppress spammy progress %
                if (line.includes('[download]') && line.includes('%') &&
                    !line.includes('100%') && !line.includes('0%') &&
                    !line.includes('Destination')) return;
                appendLog(line, cls);
            };

            const onDone = exitCode => {
                api.system.ytDlpDownloadProgress.disconnect(onProgress);
                api.system.ytDlpDone.disconnect(onDone);
                api.system.ytDlpFailed.disconnect(onFail);
                stopBtn.style.display  = 'none';
                scanBtn.style.display  = '';
                actionBtn.disabled     = false;
                if (exitCode === 0) {
                    setStatus(`Done! ${dlCompleted} downloaded, ${alreadyHave} already owned.`, 'success');
                    dlSummary.innerHTML = `<strong>${dlCompleted}</strong> / ${dlTotal} downloaded`;
                    appendLog(`\nSaved to: ${folder}`, 'log-done');
                } else {
                    setStatus(`Download finished with errors (exit code ${exitCode}).`, 'error');
                }
            };

            const onFail = err => {
                api.system.ytDlpDownloadProgress.disconnect(onProgress);
                api.system.ytDlpDone.disconnect(onDone);
                api.system.ytDlpFailed.disconnect(onFail);
                stopBtn.style.display = 'none';
                actionBtn.disabled    = false;
                if (err !== 'Cancelled')
                    setStatus('Download error: ' + err, 'error');
            };

            api.system.ytDlpDownloadProgress.connect(onProgress);
            api.system.ytDlpDone.connect(onDone);
            api.system.ytDlpFailed.connect(onFail);
            api.system.ytDlpDownload(toDownload, folder, format);
        }

        // ---- Wire action button ----
        // 'pending' = run match/download, 'create' = create playlist
        let actionState = 'pending';

        actionBtn.addEventListener('click', async () => {
            if (actionState === 'create') {
                doCreatePlaylist();
                return;
            }
            if (!api) {
                try { api = await getApi(); } catch (_) {
                    setStatus('Native bridge not available.', 'error'); return;
                }
            }
            if (mode === 'match') doMatch();
            else                  doDownload();
        });

        urlEl.focus();
    }

    // -------------------------------------------------------------------------
    // Floating button
    // -------------------------------------------------------------------------
    // Open via Settings → Music Tools
    window.addEventListener('jmp-open-yt-import', () => {
        injectStyles();
        if (!document.getElementById(`${PANEL_ID}-overlay`)) createPanel();
    });
})();
