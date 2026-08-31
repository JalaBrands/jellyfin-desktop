const features = [
    "filedownload",
    "displaylanguage",
    "htmlaudioautoplay",
    "htmlvideoautoplay",
    "externallinks",
    "clientsettings",
    "multiserver",
    "exitmenu",
    "remotecontrol",
    "fullscreenchange",
    "filedownload",
    "remotevideo",
    "displaymode",
    "screensaver",
    "fileinput"
];

const getPlugins = () => {
    const basePlugins = [
        'inputPlugin',
        'updatePlugin'
    ];

    const mpvEnabled = jmpInfo.settings?.main?.enableMPV !== false;
    if (mpvEnabled) {
        return [
            'mpvVideoPlayer',
            'mpvAudioPlayer',
            ...basePlugins
        ];
    }

    return basePlugins;
};

const plugins = getPlugins();

function injectDashboardCategoryGrid() {
    if (document.getElementById('jmp-dashboard-category-grid-style')) return;
    if (!document.head) return;

    const style = document.createElement('style');
    style.id = 'jmp-dashboard-category-grid-style';
    style.textContent = `
.homePage .homeSectionsContainer .section0 .emby-scroller,
.homePage .homeSectionsContainer .section0 .scrollFrameY,
.homeSectionsContainer .jmp-dashboard-category-grid .emby-scroller,
.homeSectionsContainer .jmp-dashboard-category-grid .scrollFrameY,
.homeSectionsContainer .jmp-dashboard-category-grid .padded-right,
.homeSectionsContainer .jmp-dashboard-category-grid .padded-left {
    overflow: visible !important;
    contain: none !important;
}

.homePage .homeSectionsContainer .section0 .itemsContainer,
.homeSectionsContainer .jmp-dashboard-category-grid .itemsContainer,
.homeSectionsContainer .jmp-dashboard-category-grid .scrollSlider,
.homeSectionsContainer .jmp-dashboard-category-grid [is="emby-itemscontainer"] {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)) !important;
    gap: 1em !important;
    transform: none !important;
    white-space: normal !important;
    overflow: visible !important;
    width: 100% !important;
    max-width: none !important;
    left: auto !important;
    right: auto !important;
}

.homePage .homeSectionsContainer .section0 .itemsContainer > .card,
.homePage .homeSectionsContainer .section0 .itemsContainer > .emby-scrollbuttons-scrollSlider,
.homeSectionsContainer .jmp-dashboard-category-grid .itemsContainer > .card,
.homeSectionsContainer .jmp-dashboard-category-grid .itemsContainer > .emby-scrollbuttons-scrollSlider,
.homeSectionsContainer .jmp-dashboard-category-grid .scrollSlider > .card,
.homeSectionsContainer .jmp-dashboard-category-grid .scrollSlider > .emby-scrollbuttons-scrollSlider {
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    flex: none !important;
}

.homePage .homeSectionsContainer .section0 .itemsContainer > .card,
.homeSectionsContainer .jmp-dashboard-category-grid .itemsContainer > .card,
.homeSectionsContainer .jmp-dashboard-category-grid .scrollSlider > .card {
    min-width: 0 !important;
}

.homePage .homeSectionsContainer .section0 .itemsContainer [class*="CardImageContainer"],
.homeSectionsContainer .jmp-dashboard-category-grid [class*="CardImageContainer"],
.homeSectionsContainer .jmp-dashboard-category-grid .cardImageContainer {
    aspect-ratio: 16 / 9;
}

.homePage .homeSectionsContainer .section0 .emby-scrollbuttons,
.homeSectionsContainer .jmp-dashboard-category-grid .emby-scrollbuttons,
.homeSectionsContainer .jmp-dashboard-category-grid .emby-scrollbuttons-button,
.homeSectionsContainer .jmp-dashboard-category-grid .btnPreviousPage,
.homeSectionsContainer .jmp-dashboard-category-grid .btnNextPage {
    display: none !important;
}

@media (max-width: 720px) {
    .homePage .homeSectionsContainer .section0 .itemsContainer,
    .homeSectionsContainer .jmp-dashboard-category-grid .itemsContainer,
    .homeSectionsContainer .jmp-dashboard-category-grid .scrollSlider {
        grid-template-columns: repeat(auto-fit, minmax(8.5em, 1fr)) !important;
        gap: 0.75em !important;
    }
}
`;
    document.head.appendChild(style);
}

function applyDashboardCategoryGrid() {
    const containers = document.querySelectorAll('.homeSectionsContainer');
    for (const container of containers) {
        const sections = container.querySelectorAll('.section0, .verticalSection, .homeSection, .section, [class*="section"]');
        for (const section of sections) {
            const text = (section.querySelector('h2, .sectionTitle, .sectionTitleText, .sectionTitleTextButton')?.textContent || section.textContent || '').trim();
            const looksLikeMyMedia = /\bMy\s+Media\b/i.test(text);
            const hasLibraryTiles = Array.from(section.querySelectorAll('.cardText, .cardText-first, .cardTitle, .cardText-secondary'))
                .some(el => /^(Movies|Shows|Books|Collections|Music|Photos|Live TV)$/i.test((el.textContent || '').trim()));

            if (looksLikeMyMedia || hasLibraryTiles || section.classList.contains('section0')) {
                section.classList.add('jmp-dashboard-category-grid');
            }
        }
    }
}

function startDashboardCategoryGrid() {
    injectDashboardCategoryGrid();
    applyDashboardCategoryGrid();

    if (!window.__jmpDashboardCategoryGridObserver && document.documentElement) {
        window.__jmpDashboardCategoryGridObserver = new MutationObserver(() => {
            injectDashboardCategoryGrid();
            applyDashboardCategoryGrid();
        });
        window.__jmpDashboardCategoryGridObserver
            .observe(document.documentElement, { childList: true, subtree: true });
    }

    if (!document.getElementById('jmp-dashboard-category-grid-style') || !window.__jmpDashboardCategoryGridObserver) {
        window.setTimeout(startDashboardCategoryGrid, 100);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDashboardCategoryGrid, { once: true });
} else {
    startDashboardCategoryGrid();
}
window.setTimeout(startDashboardCategoryGrid, 500);
window.setTimeout(startDashboardCategoryGrid, 1500);

// Plugins are bundled, return class directly
for (const plugin of plugins) {
    window[plugin] = () => {
        return window["_" + plugin];
    };
}

window.NativeShell = {
    openUrl(url, target) {
        window.api.system.openExternalUrl(url);
    },

    downloadFile(downloadInfo) {
        window.api.system.openExternalUrl(downloadInfo.url);
    },

    openClientSettings() {
        showSettingsModal();
    },

    getPlugins() {
        return plugins;
    }
};

function getDeviceProfile() {
    const CodecProfiles = [];

    if (jmpInfo.settings.video.force_transcode_dovi) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'NotEquals',
                    'Property': 'VideoRangeType',
                    'Value': 'DOVI'
                }
            ]
        });
    }

    if (jmpInfo.settings.video.force_transcode_hdr) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'VideoRangeType',
                    'Value': 'SDR'
                }
            ]
        });
    }

    if (jmpInfo.settings.video.force_transcode_hi10p) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'LessThanEqual',
                    'Property': 'VideoBitDepth',
                    'Value': '8',
                }
            ]
        });
    }

    if (jmpInfo.settings.video.force_transcode_hevc) {
        CodecProfiles.push({
            'Type': 'Video',
            'Codec': 'hevc',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'Width',
                    'Value': '0',
                }
            ],
        });
        CodecProfiles.push({
            'Type': 'Video',
            'Codec': 'h265',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'Width',
                    'Value': '0',
                }
            ],
        });
    }

    if (jmpInfo.settings.video.force_transcode_av1) {
        CodecProfiles.push({
            'Type': 'Video',
            'Codec': 'av1',
            'Conditions': [
                {
                    'Condition': 'Equals',
                    'Property': 'Width',
                    'Value': '0',
                }
            ],
        });
    }

    if (jmpInfo.settings.video.force_transcode_4k) {
        CodecProfiles.push({
            'Type': 'Video',
            'Conditions': [
                {
                    'Condition': 'LessThanEqual',
                    'Property': 'Width',
                    'Value': '1920',
                },
                {
                    'Condition': 'LessThanEqual',
                    'Property': 'Height',
                    'Value': '1080',
                }
            ]
        });
    }

    const DirectPlayProfiles = [{ 'Type': 'Audio' }, { 'Type': 'Photo' }];

    if (!jmpInfo.settings.video.always_force_transcode) {
        DirectPlayProfiles.push({ 'Type': 'Video' });
    }

    return {
        'Name': 'Jellyfin Desktop',
        'MaxStaticBitrate': 1000000000,
        'MusicStreamingTranscodingBitrate': 1280000,
        'TimelineOffsetSeconds': 5,
        'TranscodingProfiles': [
            { 'Type': 'Audio' },
            {
                'Container': 'ts',
                'Type': 'Video',
                'Protocol': 'hls',
                'AudioCodec': 'aac,mp3,ac3,opus,vorbis',
                'VideoCodec': jmpInfo.settings.video.allow_transcode_to_hevc
                    ? (
                        jmpInfo.settings.video.prefer_transcode_to_h265
                            ? 'h265,hevc,h264,mpeg4,mpeg2video'
                            : 'h264,h265,hevc,mpeg4,mpeg2video'
                    )
                    : 'h264,mpeg4,mpeg2video',
                'MaxAudioChannels': jmpInfo.settings.audio.channels === "2.0" ? '2' : '6'
            },
            { 'Container': 'jpeg', 'Type': 'Photo' }
        ],
        DirectPlayProfiles,
        'ResponseProfiles': [],
        'ContainerProfiles': [],
        CodecProfiles,
        'SubtitleProfiles': [
            { 'Format': 'srt', 'Method': 'External' },
            { 'Format': 'srt', 'Method': 'Embed' },
            { 'Format': 'ass', 'Method': 'External' },
            { 'Format': 'ass', 'Method': 'Embed' },
            { 'Format': 'sub', 'Method': 'Embed' },
            { 'Format': 'sub', 'Method': 'External' },
            { 'Format': 'ssa', 'Method': 'Embed' },
            { 'Format': 'ssa', 'Method': 'External' },
            { 'Format': 'smi', 'Method': 'Embed' },
            { 'Format': 'smi', 'Method': 'External' },
            { 'Format': 'pgssub', 'Method': 'Embed' },
            { 'Format': 'dvdsub', 'Method': 'Embed' },
            { 'Format': 'dvbsub', 'Method': 'Embed' },
            { 'Format': 'pgs', 'Method': 'Embed' }
        ]
    };
}

async function createApi() {
    // Can't append script until document exists
    await new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        } else {
            resolve();
        }
    });

    let attempts = 0;
    while ((!window.qt || !window.qt.webChannelTransport) && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.qt || !window.qt.webChannelTransport) {
        throw new Error("Qt WebChannel transport not available");
    }

    const channel = await new Promise((resolve) => {
        /*global QWebChannel */
        new QWebChannel(window.qt.webChannelTransport, resolve);
    });
    return channel.objects;
}

const sectionsFromStorage = window.sessionStorage.getItem('sections');
if (sectionsFromStorage) {
    jmpInfo.sections = JSON.parse(sectionsFromStorage);
}

let rawSettings = {};
Object.assign(rawSettings, jmpInfo.settings);
const settingsFromStorage = window.sessionStorage.getItem('settings');
if (settingsFromStorage) {
    rawSettings = JSON.parse(settingsFromStorage);
    Object.assign(jmpInfo.settings, rawSettings);
}

const settingsDescriptionsFromStorage = window.sessionStorage.getItem('settingsDescriptions');
if (settingsDescriptionsFromStorage) {
    jmpInfo.settingsDescriptions = JSON.parse(settingsDescriptionsFromStorage);
}

jmpInfo.settingsDescriptionsUpdate = [];
jmpInfo.settingsUpdate = [];
window.apiPromise = createApi().catch(error => {
    console.error("Failed to create native API:", error);
    throw error;
});
window.initCompleted = new Promise(async (resolve) => {
    window.api = await window.apiPromise;
    const settingUpdate = (section, key) => (
        (data) => new Promise(resolve => {
            rawSettings[section][key] = data;
            window.sessionStorage.setItem("settings", JSON.stringify(rawSettings));
            window.api.settings.setValue(section, key, data, resolve);
        })
    );
    const setSetting = (section, key) => {
        Object.defineProperty(jmpInfo.settings[section], key, {
            set: settingUpdate(section, key),
            get: () => rawSettings[section][key]
        });
    };
    for (const settingGroup of Object.keys(rawSettings)) {
        jmpInfo.settings[settingGroup] = {};
        for (const setting of Object.keys(rawSettings[settingGroup])) {
            setSetting(settingGroup, setting, jmpInfo.settings[settingGroup][setting]);
        }
    }
    window.api.settings.sectionValueUpdate.connect(
        (section, data) => {
            Object.assign(rawSettings[section], data);
            for (const callback of jmpInfo.settingsUpdate) {
                try {
                    callback(section, data);
                } catch (e) {
                    console.error("Update handler failed:", e);
                }
            }

            // Settings will be outdated if page reloads, so save them to session storage
            window.sessionStorage.setItem("settings", JSON.stringify(rawSettings));
        }
    );
    window.api.settings.groupUpdate.connect(
        (section, data) => {
            jmpInfo.settingsDescriptions[section] = data.settings;
            for (const callback of jmpInfo.settingsDescriptionsUpdate) {
                try {
                    callback(section, data);
                } catch (e) {
                    console.error("Description update handler failed:", e);
                }
            }

            // Settings will be outdated if page reloads, so save them to session storage
            window.sessionStorage.setItem("settingsDescriptions", JSON.stringify(jmpInfo.settingsDescriptions));
        }
    );

    // Sync cursor visibility with jellyfin-web's mouse idle state
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
                const isIdle = document.body.classList.contains('mouseIdle');
                window.api.window.setCursorVisibility(!isIdle);
            }
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    resolve();
});

window.NativeShell.AppHost = {
    init() {
        return Promise.resolve({
            deviceName: jmpInfo.deviceName,
            appName: "Jellyfin Desktop",
            appVersion: jmpInfo.version
        });
    },
    getDefaultLayout() {
        return jmpInfo.mode;
    },
    supports(command) {
        return features.includes(command.toLowerCase());
    },
    getDeviceProfile,
    getSyncProfile: getDeviceProfile,
    appName() {
        return "Jellyfin Desktop";
    },
    appVersion() {
        return jmpInfo.version;
    },
    deviceName() {
        return jmpInfo.deviceName;
    },
    exit() {
        window.api.system.exit();
    }
};

// Fetches available GPT chat models from OpenAI and repopulates the model select in the AI section.
async function refreshAiModels(apiKey, sectionGroup) {
    if (!apiKey || !apiKey.startsWith('sk-')) return;

    const modelSelect = sectionGroup ? sectionGroup.querySelector('select[data-ai-model]') : null;
    if (!modelSelect) return;

    const statusEl = sectionGroup.querySelector('[data-ai-model-status]');
    if (statusEl) statusEl.textContent = '⏳ Loading models…';

    try {
        const resp = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': 'Bearer ' + apiKey }
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();

        // Filter to chat-capable models, sort newest first
        const chatModels = data.data
            .map(m => m.id)
            .filter(id => id.startsWith('gpt-') && !id.includes('instruct') && !id.includes('realtime') && !id.includes('audio') && !id.includes('vision'))
            .sort((a, b) => b.localeCompare(a));

        if (!chatModels.length) throw new Error('No GPT models found');

        const currentVal = jmpInfo.settings.ai.openai_model || 'gpt-4o-mini';
        modelSelect.innerHTML = '';
        for (const id of chatModels) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            opt.selected = id === currentVal;
            modelSelect.appendChild(opt);
        }
        if (statusEl) statusEl.textContent = '✅ ' + chatModels.length + ' models loaded';
    } catch (err) {
        if (statusEl) statusEl.textContent = '❌ ' + err.message;
    }
}

// Fetches models available in a local Ollama instance and updates the ollama_model input.
async function refreshOllamaModels(baseUrl, sectionGroup) {
    const statusEl = sectionGroup ? sectionGroup.querySelector('[data-ollama-model-status]') : null;
    const input    = sectionGroup ? sectionGroup.querySelector('input[data-ollama-model]') : null;
    if (statusEl) statusEl.textContent = '⏳ Connecting to Ollama…';
    try {
        const url = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
        const resp = await fetch(url + '/api/tags');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const models = (data.models || []).map(m => m.name).sort();
        if (!models.length) throw new Error('No models found');
        if (statusEl) statusEl.textContent = '✅ Available: ' + models.join(', ');
        // If current value isn't set, default to first model
        if (input && !input.value) input.value = models[0];
    } catch (err) {
        if (statusEl) statusEl.textContent = '❌ ' + err.message + ' — is Ollama running?';
    }
}

// Show/hide provider-specific fields based on current provider value
function updateAiProviderVisibility(provider, sectionGroup) {
    sectionGroup.querySelectorAll('[data-ai-provider-field]').forEach(el => {
        const forProvider = el.getAttribute('data-ai-provider-field');
        el.style.display = (forProvider === provider || forProvider === 'all') ? '' : 'none';
    });
}

async function showSettingsModal() {

    const tooltipCSS = `
        .tooltip {
            position: relative;
            display: inline-block;
            margin-left: 0.5rem;
            font-size: 18px;
            vertical-align: sub;
        }

        .tooltip .tooltip-text {
            visibility: hidden;
            width: max-content;
            max-width: 40em;
            background-color: black;
            color: white;
            text-align: left;
            position: absolute;
            z-index: 1;
            border-radius: 6px;
            padding: 5px;
            top: -4px;
            left: 25px;
            border: solid 1px grey;
            font-size: 12px;
        }

        .tooltip:hover .tooltip-text {
            visibility: visible;
        }`;

    var style = document.createElement('style')
    style.innerText = tooltipCSS
    document.head.appendChild(style)

    const modalContainer = document.createElement("div");
    modalContainer.className = "dialogContainer";
    modalContainer.style.backgroundColor = "rgba(0,0,0,0.5)";
    modalContainer.addEventListener("click", e => {
        if (e.target == modalContainer) {
            modalContainer.remove();
        }
    });
    document.body.appendChild(modalContainer);

    const modalContainer2 = document.createElement("div");
    modalContainer2.className = "focuscontainer dialog dialog-fixedSize dialog-small formDialog opened";
    modalContainer.appendChild(modalContainer2);

    const modalHeader = document.createElement("div");
    modalHeader.className = "formDialogHeader";
    modalContainer2.appendChild(modalHeader);

    const title = document.createElement("h3");
    title.className = "formDialogHeaderTitle";
    title.textContent = "Client Settings";
    modalHeader.appendChild(title);

    const modalContents = document.createElement("div");
    modalContents.className = "formDialogContent smoothScrollY";
    modalContents.style.paddingTop = "2em";
    modalContents.style.marginBottom = "6.2em";
    modalContainer2.appendChild(modalContents);

    // Music Tools section (at top for visibility)
    const toolsGroup = document.createElement("fieldset");
    toolsGroup.className = "editItemMetadataForm editMetadataForm dialog-content-centered";
    toolsGroup.style.border = 0;
    toolsGroup.style.outline = 0;
    modalContents.appendChild(toolsGroup);
    const toolsLegend = document.createElement("legend");
    const toolsHeader = document.createElement("h2");
    toolsHeader.textContent = "Music Tools";
    toolsLegend.appendChild(toolsHeader);
    toolsGroup.appendChild(toolsLegend);

    const toolsBtnRow = document.createElement("div");
    toolsBtnRow.style.cssText = "display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:8px;";
    toolsGroup.appendChild(toolsBtnRow);

    const aiBtn = document.createElement("button");
    aiBtn.className = "raised button-submit emby-button";
    aiBtn.textContent = "🎵 AI Playlist";
    aiBtn.addEventListener("click", () => {
        modalContainer.remove();
        if (!document.getElementById('jmp-ai-playlist-panel-overlay')) {
            window.dispatchEvent(new CustomEvent('jmp-open-ai-playlist'));
        }
    });
    toolsBtnRow.appendChild(aiBtn);

    const ytBtn = document.createElement("button");
    ytBtn.className = "raised button-submit emby-button";
    ytBtn.textContent = "YouTube Import";
    ytBtn.addEventListener("click", () => {
        modalContainer.remove();
        if (!document.getElementById('jmp-yt-import-panel-overlay')) {
            window.dispatchEvent(new CustomEvent('jmp-open-yt-import'));
        }
    });
    toolsBtnRow.appendChild(ytBtn);

    const settingUpdateHandlers = {};
    for (const sectionOrder of jmpInfo.sections.sort((a, b) => a.order - b.order)) {
        const section = sectionOrder.key;
        const group = document.createElement("fieldset");
        group.className = "editItemMetadataForm editMetadataForm dialog-content-centered";
        group.style.border = 0;
        group.style.outline = 0;
        modalContents.appendChild(group);

        const createSection = async (clear) => {
            if (clear) {
                group.innerHTML = "";
            }

            const values = jmpInfo.settings[section];
            const settings = jmpInfo.settingsDescriptions[section];

            const legend = document.createElement("legend");
            const legendHeader = document.createElement("h2");
            legendHeader.textContent = sectionOrder.display_name || section;
            legendHeader.style.textTransform = sectionOrder.display_name ? "none" : "capitalize";
            legend.appendChild(legendHeader);
            if (section == "other") {
                const legendSubHeader = document.createElement("h4");
                legendSubHeader.textContent = "Use this section to input custom MPV configuration. These will override the above settings.";
                legend.appendChild(legendSubHeader);
            }
            group.appendChild(legend);

            for (const setting of settings) {
                const label = document.createElement("label");
                label.className = "inputContainer";
                label.style.marginBottom = "1.8em";
                label.style.display = "block";

                let helpElement;
                if (setting.help) {
                    helpElement = document.createElement("div");
                    helpElement.className = "tooltip";
                    const helpIcon = document.createElement("span");
                    helpIcon.style.fontSize = "18px"
                    helpIcon.className = "material-icons help_outline";
                    helpElement.appendChild(helpIcon);
                    const tooltipElement = document.createElement("span");
                    tooltipElement.className = "tooltip-text";
                    tooltipElement.innerText = setting.help;
                    helpElement.appendChild(tooltipElement);
                }

                if (setting.options) {
                    const safeValues = {};
                    const control = document.createElement("select");
                    control.className = "emby-select-withcolor emby-select";
                    // Mark the AI model select for dynamic model loading
                    if (section === "ai" && setting.key === "openai_model") {
                        control.setAttribute("data-ai-model", "1");
                    }
                    for (const option of setting.options) {
                        safeValues[String(option.value)] = option.value;
                        const opt = document.createElement("option");
                        opt.value = option.value;
                        opt.selected = option.value == values[setting.key];
                        let optionName = option.title;
                        const swTest = `${section}.${setting.key}.`;
                        const swTest2 = `${section}.`;
                        if (optionName.startsWith(swTest)) {
                            optionName = optionName.substring(swTest.length);
                        } else if (optionName.startsWith(swTest2)) {
                            optionName = optionName.substring(swTest2.length);
                        }
                        opt.appendChild(document.createTextNode(optionName));
                        control.appendChild(opt);
                    }
                    control.addEventListener("change", async (e) => {
                        jmpInfo.settings[section][setting.key] = safeValues[e.target.value] ?? e.target.value;
                        // When provider changes, show/hide relevant AI fields
                        if (section === "ai" && setting.key === "provider") {
                            updateAiProviderVisibility(e.target.value, group);
                        }
                    });
                    const labelText = document.createElement('label');
                    labelText.className = "inputLabel";
                    labelText.textContent = (setting.displayName ? setting.displayName : setting.key) + ": ";
                    label.appendChild(labelText);
                    if (helpElement) label.appendChild(helpElement);
                    label.appendChild(control);
                    // For the AI model select, add a refresh button + status line
                    if (section === "ai" && setting.key === "openai_model") {
                        const row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:6px;";
                        const refreshBtn = document.createElement("button");
                        refreshBtn.textContent = "🔄 Load Models from OpenAI";
                        refreshBtn.className = "raised button-submit emby-button";
                        refreshBtn.style.cssText = "padding:6px 14px;font-size:13px;cursor:pointer;";
                        refreshBtn.addEventListener("click", () => {
                            const apiKey = jmpInfo.settings.ai.openai_api_key || "";
                            refreshAiModels(apiKey, group);
                        });
                        const statusSpan = document.createElement("span");
                        statusSpan.setAttribute("data-ai-model-status", "1");
                        statusSpan.style.cssText = "font-size:12px;color:#aaa;";
                        row.appendChild(refreshBtn);
                        row.appendChild(statusSpan);
                        label.appendChild(row);
                        // Auto-load if API key is already set
                        const existingKey = jmpInfo.settings.ai && jmpInfo.settings.ai.openai_api_key;
                        if (existingKey && existingKey.startsWith('sk-')) {
                            setTimeout(() => refreshAiModels(existingKey, group), 100);
                        }
                    }
                    // Tag AI provider-specific fields for show/hide
                    if (section === "ai") {
                        const providerField = setting.key === "provider" ? "all"
                            : (setting.key === "openai_api_key" || setting.key === "openai_model") ? "openai"
                            : (setting.key === "ollama_base_url" || setting.key === "ollama_model") ? "ollama"
                            : null;
                        if (providerField) label.setAttribute("data-ai-provider-field", providerField);
                    }
                } else if (setting.inputType === "textarea") {
                    const control = document.createElement("textarea");
                    control.className = "emby-select-withcolor emby-select";
                    control.style = "resize: none;"
                    control.value = values[setting.key];
                    control.rows = 5;
                    control.addEventListener("change", e => {
                        jmpInfo.settings[section][setting.key] = e.target.value;
                    });
                    const labelText = document.createElement('label');
                    labelText.className = "inputLabel";
                    labelText.textContent = (setting.displayName ? setting.displayName : setting.key) + ": ";
                    label.appendChild(labelText);
                    if (helpElement) label.appendChild(helpElement);
                    label.appendChild(control);
                } else if (setting.inputType === "text" || setting.inputType === "password") {
                    const control = document.createElement("input");
                    control.type = setting.inputType;
                    control.className = "emby-input";
                    control.style.cssText = "width:100%;box-sizing:border-box;margin-top:4px;";
                    control.value = values[setting.key] || "";
                    control.placeholder = setting.inputType === "password" ? "sk-..." : "";
                    if (section === "ai" && setting.key === "ollama_model") {
                        control.setAttribute("data-ollama-model", "1");
                    }
                    control.addEventListener("change", e => {
                        jmpInfo.settings[section][setting.key] = e.target.value;
                        // When the AI API key changes, trigger model refresh
                        if (section === "ai" && setting.key === "openai_api_key") {
                            refreshAiModels(e.target.value, group);
                        }
                    });
                    const labelText = document.createElement('label');
                    labelText.className = "inputLabel";
                    labelText.textContent = (setting.displayName ? setting.displayName : setting.key) + ": ";
                    label.appendChild(labelText);
                    if (helpElement) label.appendChild(helpElement);
                    label.appendChild(control);
                    // For ollama_model, add a "Load Models" button
                    if (section === "ai" && setting.key === "ollama_model") {
                        const row = document.createElement("div");
                        row.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:6px;";
                        const loadBtn = document.createElement("button");
                        loadBtn.textContent = "🦙 Load Ollama Models";
                        loadBtn.className = "raised button-submit emby-button";
                        loadBtn.style.cssText = "padding:6px 14px;font-size:13px;cursor:pointer;";
                        loadBtn.addEventListener("click", () => {
                            const baseUrl = jmpInfo.settings.ai.ollama_base_url || "http://localhost:11434";
                            refreshOllamaModels(baseUrl, group);
                        });
                        const statusSpan = document.createElement("span");
                        statusSpan.setAttribute("data-ollama-model-status", "1");
                        statusSpan.style.cssText = "font-size:12px;color:#aaa;";
                        row.appendChild(loadBtn);
                        row.appendChild(statusSpan);
                        label.appendChild(row);
                    }
                    // Tag AI provider-specific fields
                    if (section === "ai") {
                        const providerField = setting.key === "openai_api_key" ? "openai"
                            : (setting.key === "ollama_base_url" || setting.key === "ollama_model") ? "ollama"
                            : null;
                        if (providerField) label.setAttribute("data-ai-provider-field", providerField);
                    }
                } else {
                    const control = document.createElement("input");
                    control.type = "checkbox";
                    control.checked = values[setting.key];
                    control.addEventListener("change", e => {
                        jmpInfo.settings[section][setting.key] = e.target.checked;
                    });
                    label.appendChild(control);
                    label.appendChild(document.createTextNode(" " + (setting.displayName ? setting.displayName : setting.key)));
                    if (helpElement) label.appendChild(helpElement);
                }

                group.appendChild(label);
            }

            // After rendering AI section, apply initial provider visibility
            if (section === "ai") {
                const currentProvider = (values.provider) || "openai";
                updateAiProviderVisibility(currentProvider, group);
            }
        };
        settingUpdateHandlers[section] = () => createSection(true);
        createSection();
    }

    const onSectionUpdate = (section) => {
        if (section in settingUpdateHandlers) {
            settingUpdateHandlers[section]();
        }
    };
    jmpInfo.settingsDescriptionsUpdate.push(onSectionUpdate);
    jmpInfo.settingsUpdate.push(onSectionUpdate);

    if (jmpInfo.settings.main.userWebClient) {
        const group = document.createElement("fieldset");
        group.className = "editItemMetadataForm editMetadataForm dialog-content-centered";
        group.style.border = 0;
        group.style.outline = 0;
        modalContents.appendChild(group);
        const legend = document.createElement("legend");
        const legendHeader = document.createElement("h2");
        legendHeader.textContent = "Saved Server";
        legend.appendChild(legendHeader);
        const legendSubHeader = document.createElement("h4");
        legendSubHeader.textContent = (
            "The server you first connected to is your saved server. " +
            "It provides the web client for Jellyfin in the absence of a bundled one. " +
            "You can use this option to change it to another one. This does NOT log you off."
        );
        legend.appendChild(legendSubHeader);
        group.appendChild(legend);

        const resetSavedServer = document.createElement("button");
        resetSavedServer.className = "raised button-cancel block btnCancel emby-button";
        resetSavedServer.textContent = "Reset Saved Server"
        resetSavedServer.style.marginLeft = "auto";
        resetSavedServer.style.marginRight = "auto";
        resetSavedServer.style.maxWidth = "50%";
        resetSavedServer.addEventListener("click", async () => {
            window.jmpInfo.settings.main.userWebClient = '';
            window.location.href = jmpInfo.scriptPath + "/find-webclient.html";
        });
        group.appendChild(resetSavedServer);
    }

    const closeContainer = document.createElement("div");
    closeContainer.className = "formDialogFooter";
    modalContents.appendChild(closeContainer);

    const close = document.createElement("button");
    close.className = "raised button-cancel block btnCancel formDialogFooterItem emby-button";
    close.textContent = "Close"
    close.addEventListener("click", () => {
        modalContainer.remove();
    });
    closeContainer.appendChild(close);
}

let lastFullscreenState = window.jmpInfo.settings.main.fullscreen;

window.jmpInfo.settingsUpdate.push(function(section) {
    if (section === 'main') {
        const currentFullscreenState = window.jmpInfo.settings.main.fullscreen;
        if (currentFullscreenState !== lastFullscreenState) {
            lastFullscreenState = currentFullscreenState;

            if (window.api && window.api.player) {
                window.api.player.notifyFullscreenChange(currentFullscreenState);
                console.log('Player fullscreen notified');
            }

            if (window.Events && window.playbackManager && window.playbackManager._currentPlayer) {
                window.Events.trigger(window.playbackManager._currentPlayer, 'fullscreenchange');
            }
        }
    }
});
