async function tryConnect(server) {
    try {
        if (!server.startsWith("http")) {
            server = "http://" + server;
        }

        console.log("Checking connectivity to:", server);

        const resolvedUrl = await window.jmpCheckServerConnectivity(server);
        console.log("Server connectivity check passed");
        console.log("Resolved URL:", resolvedUrl);

        // Save original URL but navigate to fully-resolved redirect
        window.jmpInfo.settings.main.userWebClient = server;

        // Navigation will clean up handlers, but do it explicitly
        window.location = resolvedUrl;

        return true;
    } catch (e) {
        console.error("Server connectivity check failed:", e);
        return false;
    }
}

let isConnecting = false;

const waitForNativeApi = async () => {
    let attempts = 0;
    while (!window.apiPromise && !window.api && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (window.apiPromise) {
        await window.apiPromise;
    }
};

const updateButtonState = () => {
    const address = document.getElementById('address');
    const button = document.getElementById('connect-button');
    const hasValue = address.value.trim().length > 0;

    if (!isConnecting) {
        button.disabled = !hasValue;
    }
};

const showConnectingUi = () => {
    const address = document.getElementById('address');
    const title = document.getElementById('title');
    const spinner = document.getElementById('spinner');
    const button = document.getElementById('connect-button');

    isConnecting = true;
    title.textContent = '';
    title.style.visibility = 'hidden';
    address.classList.add('connecting');
    address.style.visibility = 'hidden';
    address.disabled = true;
    spinner.style.display = 'block';
    button.textContent = window.changeServerButtonText;
    button.classList.add('cancel');
    button.disabled = false;
    button.style.visibility = 'visible';
    document.addEventListener('keydown', cancelOnEscape);
};

const showServerForm = () => {
    const address = document.getElementById('address');
    const title = document.getElementById('title');
    const spinner = document.getElementById('spinner');
    const button = document.getElementById('connect-button');

    isConnecting = false;
    title.textContent = title.getAttribute('data-original-text');
    title.style.visibility = 'visible';
    address.classList.remove('connecting');
    address.style.visibility = 'visible';
    address.disabled = false;
    spinner.style.display = 'none';
    button.textContent = button.getAttribute('data-original-text');
    button.classList.remove('cancel');
    button.style.visibility = 'visible';
    document.removeEventListener('keydown', cancelOnEscape);
    address.focus();
    address.select();
    updateButtonState();
};

const cancelOnEscape = (e) => {
    if (isConnecting && e.key === 'Escape') {
        cancelConnection();
    }
};

const startConnecting = async () => {
    const address = document.getElementById('address');
    const server = address.value.trim();

    if (!server) return;

    showConnectingUi();

    // C++ handles retries, just wait for result
    const connected = await tryConnect(server);

    if (!connected) {
        showServerForm();
    }
};

const cancelConnection = () => {
    if (!isConnecting) return;

    console.log("Cancelling connection");
    isConnecting = false;

    // Cancel C++ connectivity check and abort JS promise
    if (window.api && window.api.system) {
        window.api.system.cancelServerConnectivity();
    }
    if (window.jmpCheckServerConnectivity.abort) {
        window.jmpCheckServerConnectivity.abort();
    }

    showServerForm();
};

// Button click handler
document.getElementById('connect-button').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isConnecting) {
        cancelConnection();
    } else if (!e.target.disabled) {
        startConnecting();
    }
});

// Form submit handler
document.getElementById('connect-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!isConnecting) {
        startConnecting();
    }
});

// Input change handler
document.getElementById('address').addEventListener('input', updateButtonState);


// Enter key handler
document.addEventListener('keydown', (e) => {
    const address = document.getElementById('address');
    if (e.key === 'Enter' && !isConnecting && !address.disabled && address.value.trim()) {
        e.preventDefault();
        startConnecting();
    }
});

// Auto-connect on load
(async () => {
    console.log('Auto-connect: starting');

    await waitForNativeApi();

    const savedServer = window.jmpInfo.settings.main.userWebClient;
    console.log('Auto-connect: savedServer =', savedServer);

    if (savedServer) {
        console.log('Auto-connect: checking saved server', savedServer);

        const address = document.getElementById('address');

        // Set address value for potential display later
        address.value = savedServer;

        // Keep a visible way to cancel auto-connect and edit the saved address.
        showConnectingUi();

        // C++ handles retries, just wait for result
        const connected = await tryConnect(savedServer);

        if (!connected) {
            // User cancelled or error - show UI
            showServerForm();
        }
    } else {
        const title = document.getElementById('title');
        const address = document.getElementById('address');
        const button = document.getElementById('connect-button');

        title.style.visibility = 'visible';
        address.style.visibility = 'visible';
        button.style.visibility = 'visible';
        address.focus();
        updateButtonState();
    }
})();
