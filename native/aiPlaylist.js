// AI Playlist Plugin for Jellyfin Desktop
// Injects a floating "AI Playlist" button that lets users describe what they want
// to listen to / watch, then builds a playlist from their Jellyfin library.
// v2: Two-phase AI (intent extraction → genre-targeted fetch → BPM-aware selection)

(function () {
    'use strict';

    const PANEL_ID = 'jmp-ai-playlist-panel';
    const BTN_ID   = 'jmp-ai-playlist-btn';

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
    padding: 28px 32px;
    width: min(560px, 92vw);
    box-shadow: 0 8px 40px rgba(0,0,0,0.7);
    color: #e0e0e0;
    font-family: inherit;
    position: relative;
}
#${PANEL_ID} h2 {
    margin: 0 0 6px;
    font-size: 20px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
}
#${PANEL_ID} .subtitle {
    font-size: 13px;
    color: #888;
    margin: 0 0 14px;
}
#${PANEL_ID} textarea {
    width: 100%;
    box-sizing: border-box;
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 15px;
    font-family: inherit;
    padding: 12px;
    resize: vertical;
    min-height: 90px;
    outline: none;
    transition: border-color 0.2s;
}
#${PANEL_ID} textarea:focus { border-color: #00a4dc; }
#${PANEL_ID} .mood-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
}
#${PANEL_ID} .mood-chip {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 20px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    color: #ccc;
    user-select: none;
}
#${PANEL_ID} .mood-chip:hover { background: #333; border-color: #00a4dc; color: #fff; }
#${PANEL_ID} .mood-chip.active { background: #004f6b; border-color: #00a4dc; color: #fff; }
#${PANEL_ID} .options-row {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-top: 14px;
    flex-wrap: wrap;
}
#${PANEL_ID} .library-type {
    font-size: 13px;
    color: #aaa;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
#${PANEL_ID} .library-type label { cursor: pointer; display: flex; align-items: center; gap: 4px; }
#${PANEL_ID} .library-type input { cursor: pointer; accent-color: #00a4dc; }
#${PANEL_ID} .size-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #aaa;
    margin-left: auto;
}
#${PANEL_ID} .size-row select {
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    color: #e0e0e0;
    padding: 4px 8px;
    font-size: 13px;
    cursor: pointer;
}
#${PANEL_ID} .btn-row {
    margin-top: 20px;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}
#${PANEL_ID} .btn-primary {
    background: #00a4dc;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    font-family: inherit;
}
#${PANEL_ID} .btn-primary:hover:not(:disabled) { background: #0092c4; }
#${PANEL_ID} .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
#${PANEL_ID} .btn-cancel {
    background: transparent;
    color: #aaa;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 10px 20px;
    font-size: 14px;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
    font-family: inherit;
}
#${PANEL_ID} .btn-cancel:hover { color: #fff; border-color: #777; }
#${PANEL_ID} .status {
    margin-top: 14px;
    font-size: 13px;
    min-height: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
}
#${PANEL_ID} .status.error { color: #f44; }
#${PANEL_ID} .status.success { color: #4c4; }
#${PANEL_ID} .spinner {
    width: 16px; height: 16px;
    border: 2px solid #555;
    border-top-color: #00a4dc;
    border-radius: 50%;
    animation: jmp-spin 0.8s linear infinite;
    flex-shrink: 0;
}
@keyframes jmp-spin { to { transform: rotate(360deg); } }
`;

    function injectStyles() {
        if (document.getElementById('jmp-ai-styles')) return;
        const el = document.createElement('style');
        el.id = 'jmp-ai-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    // -------------------------------------------------------------------------
    // Jellyfin API helpers
    // -------------------------------------------------------------------------
    async function getApiClient() {
        const ac = window.ApiClient;
        if (!ac) throw new Error('Jellyfin ApiClient not found.');
        return ac;
    }

    // Fetch library items, optionally filtered by genre names from AI intent.
    // Always includes Tags field for embedded BPM data.
    async function fetchLibraryItems(mediaTypes, genreFilter) {
        const ac = await getApiClient();
        const userId = ac.getCurrentUserId();
        const serverAddress = ac.serverAddress();

        const pageSize = 2000;
        let startIndex = 0;
        let allItems = [];

        while (true) {
            const paramObj = {
                UserId: userId,
                Recursive: 'true',
                Fields: 'Genres,Artists,AlbumArtist,ProductionYear,Tags,TagItems',
                IncludeItemTypes: mediaTypes.join(','),
                Limit: String(pageSize),
                StartIndex: String(startIndex),
                SortBy: 'Random',
            };

            // If the AI gave us specific genres, filter by them for a much tighter result set
            if (genreFilter && genreFilter.length > 0) {
                paramObj.Genres = genreFilter.join('|');
            }

            const params = new URLSearchParams(paramObj);
            const resp = await fetch(`${serverAddress}/Items?${params}`, {
                headers: { 'X-Emby-Token': ac.accessToken() }
            });
            if (!resp.ok) throw new Error(`Library fetch failed: ${resp.status}`);
            const data = await resp.json();
            const page = data.Items || [];
            allItems = allItems.concat(page);

            const total = data.TotalRecordCount || 0;
            if (page.length < pageSize || allItems.length >= total) break;
            startIndex += pageSize;
        }

        return allItems;
    }

    async function createPlaylist(name, itemIds) {
        const ac = await getApiClient();
        const userId = ac.getCurrentUserId();
        const serverAddress = ac.serverAddress();

        const resp = await fetch(`${serverAddress}/Playlists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Emby-Token': ac.accessToken()
            },
            body: JSON.stringify({ Name: name, Ids: itemIds, UserId: userId })
        });
        if (!resp.ok) throw new Error(`Playlist creation failed: ${resp.status}`);
        return await resp.json();
    }

    // -------------------------------------------------------------------------
    // Panel UI
    // -------------------------------------------------------------------------
    const MOOD_CHIPS = [
        { label: '😌 Chill',       theme: 'Chill & Relaxed'     },
        { label: '⚡ Energetic',    theme: 'High Energy'          },
        { label: '🌙 Late Night',   theme: 'Late Night Vibes'     },
        { label: '🏋️ Workout',     theme: 'Workout Motivation'   },
        { label: '🎉 Party',        theme: 'Party & Dance'        },
        { label: '🧘 Focus',        theme: 'Focus & Concentration'},
        { label: '🌅 Morning',      theme: 'Happy Morning Vibes'  },
        { label: '💔 Melancholy',   theme: 'Sad & Melancholy'     },
    ];

    function createPanel() {
        const overlay = document.createElement('div');
        overlay.id = `${PANEL_ID}-overlay`;

        const moodChipsHtml = MOOD_CHIPS.map(c =>
            `<span class="mood-chip" data-theme="${c.theme}">${c.label}</span>`
        ).join('');

        overlay.innerHTML = `
<div id="${PANEL_ID}">
  <h2>🎵 AI Playlist</h2>
  <p class="subtitle">Describe what you want — AI will analyze your mood, energy &amp; BPM, then curate the perfect playlist.</p>
  <textarea id="jmp-ai-prompt" placeholder='e.g. "upbeat 80s rock for a road trip", "calm jazz for studying", "high BPM electronic for a workout"…' rows="3"></textarea>
  <div style="font-size:12px;color:#888;margin:4px 0 8px;">Theme (optional — AI uses this to reframe your request):</div>
  <div class="mood-chips">${moodChipsHtml}</div>
  <div class="options-row">
    <div class="library-type">
      <strong>Library:</strong>
      <label><input type="checkbox" value="Audio" checked> Music</label>
      <label><input type="checkbox" value="Movie"> Movies</label>
      <label><input type="checkbox" value="Episode"> TV</label>
    </div>
    <div class="size-row">
      <label for="jmp-ai-size">Songs:</label>
      <select id="jmp-ai-size">
        <option value="10">10</option>
        <option value="20" selected>20</option>
        <option value="30">30</option>
        <option value="50">50</option>
      </select>
    </div>
  </div>
  <div class="status" id="jmp-ai-status"></div>
  <div class="btn-row">
    <button class="btn-cancel" id="jmp-ai-cancel">Cancel</button>
    <button class="btn-primary" id="jmp-ai-submit">✨ Build Playlist</button>
  </div>
</div>`;

        document.body.appendChild(overlay);

        const statusEl  = overlay.querySelector('#jmp-ai-status');
        const submitBtn = overlay.querySelector('#jmp-ai-submit');
        const cancelBtn = overlay.querySelector('#jmp-ai-cancel');
        const promptEl  = overlay.querySelector('#jmp-ai-prompt');
        const sizeEl    = overlay.querySelector('#jmp-ai-size');

        function setStatus(msg, type) {
            if (!msg) { statusEl.innerHTML = ''; return; }
            const spinner = type === 'loading' ? '<div class="spinner"></div>' : '';
            statusEl.className = `status${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
            statusEl.innerHTML = `${spinner}<span>${msg}</span>`;
        }

        function close() { overlay.remove(); }

        cancelBtn.addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

        // Mood chip clicks — select one theme at a time (doesn't modify the prompt text)
        let selectedTheme = null;
        overlay.querySelectorAll('.mood-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const isActive = chip.classList.contains('active');
                overlay.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
                if (!isActive) {
                    chip.classList.add('active');
                    selectedTheme = chip.dataset.theme;
                } else {
                    selectedTheme = null;
                }
            });
        });

        submitBtn.addEventListener('click', async () => {
            const prompt = promptEl.value.trim();
            if (!prompt) { setStatus('Please describe the playlist you want.', 'error'); return; }

            // Combine user prompt with optional theme for a richer intent extraction
            const fullPrompt = selectedTheme
                ? `${prompt}\n\nTheme: ${selectedTheme}`
                : prompt;

            const checkedTypes = [...overlay.querySelectorAll('.library-type input:checked')].map(i => i.value);
            if (!checkedTypes.length) { setStatus('Select at least one library type.', 'error'); return; }

            const targetCount = parseInt(sizeEl.value, 10) || 20;
            submitBtn.disabled = true;

            // Wait for AI component
            let api;
            try { api = await window.apiPromise; } catch (err) {
                setStatus('Could not connect to native AI component.', 'error');
                submitBtn.disabled = false;
                return;
            }
            if (!api || !api.ai) {
                setStatus('AI component not available. Check your build.', 'error');
                submitBtn.disabled = false;
                return;
            }

            // ---- Phase 1: Extract intent ----
            setStatus('Analyzing your request…', 'loading');

            let intentJson = '{}';
            let extractedGenres = [];

            await new Promise((resolve) => {
                let done = false;
                const onIntent = (json) => {
                    if (done) return; done = true;
                    api.ai.intentReady.disconnect(onIntent);
                    api.ai.playlistError.disconnect(onIntentErr);
                    intentJson = json;
                    try {
                        const parsed = JSON.parse(json);
                        extractedGenres = parsed.genres || [];
                    } catch (_) {}
                    resolve();
                };
                const onIntentErr = (err) => {
                    if (done) return; done = true;
                    api.ai.intentReady.disconnect(onIntent);
                    api.ai.playlistError.disconnect(onIntentErr);
                    // Non-fatal — fall back to unfiltered fetch
                    console.warn('Intent extraction failed:', err);
                    resolve();
                };
                api.ai.intentReady.connect(onIntent);
                api.ai.playlistError.connect(onIntentErr);
                api.ai.extractIntent(fullPrompt);
            });

            // ---- Phase 2a: Fetch library (genre-filtered if we have genres) ----
            const intentParsed = (() => { try { return JSON.parse(intentJson); } catch (_) { return {}; } })();
            const refinedPrompt = intentParsed.refined_prompt || '';
            if (refinedPrompt) setStatus(`🎯 ${refinedPrompt}`, 'loading');

            const genreLabel = extractedGenres.length > 0
                ? `${extractedGenres.slice(0, 3).join(', ')} tracks`
                : 'library';
            setStatus(`Fetching ${genreLabel}…`, 'loading');

            let items;
            try {
                items = await fetchLibraryItems(checkedTypes, extractedGenres.length > 0 ? extractedGenres : null);
            } catch (err) {
                setStatus('Could not load library: ' + err.message, 'error');
                submitBtn.disabled = false;
                return;
            }

            // If genre filter returned too few items, fall back to full library
            if (items.length < 20 && extractedGenres.length > 0) {
                setStatus('Few genre matches — expanding to full library…', 'loading');
                try {
                    items = await fetchLibraryItems(checkedTypes, null);
                } catch (err) {
                    setStatus('Could not load library: ' + err.message, 'error');
                    submitBtn.disabled = false;
                    return;
                }
            }

            if (!items.length) {
                setStatus('No items found in your library for the selected types.', 'error');
                submitBtn.disabled = false;
                return;
            }

            // ---- Phase 2b: AI selects + orders ----
            setStatus(`Curating from ${items.length} tracks…`, 'loading');

            let done2 = false;
            const onReady = (itemIds) => {
                if (done2) return; done2 = true;
                api.ai.playlistReady.disconnect(onReady);
                api.ai.playlistError.disconnect(onError);
                handleResult(itemIds, intentParsed);
            };
            const onError = (errMsg) => {
                if (done2) return; done2 = true;
                api.ai.playlistReady.disconnect(onReady);
                api.ai.playlistError.disconnect(onError);
                setStatus('AI error: ' + errMsg, 'error');
                submitBtn.disabled = false;
            };

            api.ai.playlistReady.connect(onReady);
            api.ai.playlistError.connect(onError);
            api.ai.buildPlaylist(fullPrompt, JSON.stringify(items), intentJson, targetCount);

            async function handleResult(itemIds, intent) {
                if (!itemIds || !itemIds.length) {
                    setStatus('AI returned no matching items. Try a different prompt.', 'error');
                    submitBtn.disabled = false;
                    return;
                }

                setStatus(`Creating playlist with ${itemIds.length} tracks…`, 'loading');
                // Use AI-generated name if available, else fall back to truncated prompt
                const aiName = intent && intent.playlist_name;
                const playlistName = aiName || `AI: ${prompt.length > 48 ? prompt.slice(0, 48) + '…' : prompt}`;
                try {
                    const result = await createPlaylist(playlistName, itemIds);
                    setStatus(`✅ "${playlistName}" created with ${itemIds.length} tracks!`, 'success');
                    setTimeout(() => {
                        close();
                        if (result && result.Id && window.Emby && window.Emby.Page)
                            window.Emby.Page.show('details?id=' + result.Id);
                    }, 1800);
                } catch (err) {
                    setStatus('Could not create playlist: ' + err.message, 'error');
                    submitBtn.disabled = false;
                }
            }
        });

        promptEl.focus();
    }

    // -------------------------------------------------------------------------
    // Floating button injection
    // -------------------------------------------------------------------------
    // Open via Settings → Music Tools
    window.addEventListener('jmp-open-ai-playlist', () => {
        injectStyles();
        if (!document.getElementById(`${PANEL_ID}-overlay`)) createPanel();
    });
})();
