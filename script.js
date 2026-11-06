const API_URL = "http://localhost:3001";
const STORAGE_KEY = "vortex_conversations";
const CHAT_TIMEOUT_MS = 120000;
const HEALTH_TIMEOUT_MS = 5000;

function initializeApp() {
    const requiredIds = [
        "messageInput",
        "sendButton",
        "messages",
        "welcome",
        "chatList",
        "statusDot",
        "connectionStatus",
        "chatArea",
        "newChat",
        "clearChat"
    ];

    const elements = {};

    for (const id of requiredIds) {
        const element = document.getElementById(id);

        if (!element) {
            console.error(`Vortex: missing HTML element #${id}`);
            return;
        }

        elements[id] = element;
    }

    const {
        messageInput,
        sendButton,
        messages,
        welcome,
        chatList,
        statusDot,
        connectionStatus,
        chatArea,
        newChat,
        clearChat
    } = elements;

    // Keep the welcome element outside the message container
    // so clearing messages does not remove it.
    if (messages.contains(welcome)) {
        messages.parentNode.insertBefore(welcome, messages);
    }

    let conversations = loadConversations();
    let currentChatId = null;
    let activeRequest = null;
    let isCheckingConnection = false;

    // LOAD CONVERSATIONS

    function loadConversations() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(STORAGE_KEY) || "[]"
            );

            if (!Array.isArray(saved)) {
                return [];
            }

            const seenIds = new Set();

            return saved
                .filter(chat => {
                    if (
                        !chat ||
                        typeof chat.id !== "string" ||
                        !chat.id ||
                        !Array.isArray(chat.messages) ||
                        seenIds.has(chat.id)
                    ) {
                        return false;
                    }

                    seenIds.add(chat.id);
                    return true;
                })
                .map(chat => ({
                    id: chat.id,
                    title:
                        typeof chat.title === "string" &&
                        chat.title.trim()
                            ? chat.title
                            : "New conversation",
                    messages: chat.messages
                        .filter(message =>
                            message &&
                            ["user", "assistant"].includes(message.role) &&
                            typeof message.content === "string"
                        )
                        .map(message => ({
                            role: message.role,
                            content: message.content
                        }))
                }));
        } catch (error) {
            console.error(
                "Vortex: could not load saved conversations.",
                error
            );

            return [];
        }
    }

    // SAVE CONVERSATIONS

    function saveConversations() {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(conversations)
            );
        } catch (error) {
            console.error(
                "Vortex: could not save conversations. " +
                "Storage may be full or unavailable.",
                error
            );
        }
    }

    // CREATE CHAT

    function createChat() {
        const id =
            typeof globalThis.crypto?.randomUUID === "function"
                ? globalThis.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const chat = {
            id,
            title: "New conversation",
            messages: []
        };

        conversations.unshift(chat);
        currentChatId = chat.id;

        saveConversations();
        renderMessages();
        renderChatList();
    }

    // GET CURRENT CHAT

    function getCurrentChat() {
        return conversations.find(
            chat => chat.id === currentChatId
        );
    }

    // SCROLL TO LATEST MESSAGE

    function scrollToBottom() {
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // CHAT LIST

    function renderChatList() {
        chatList.replaceChildren();

        conversations.forEach(chat => {
            const item = document.createElement("div");

            item.className = "chat-item";
            item.textContent = chat.title;

            if (chat.id === currentChatId) {
                item.classList.add("active");
            }

            item.addEventListener("click", () => {
                currentChatId = chat.id;

                renderMessages();
                renderChatList();
            });

            chatList.appendChild(item);
        });
    }

    // ADD MESSAGE TO SCREEN

    function addMessageToScreen(role, content) {
        const wrapper = document.createElement("div");
        wrapper.className = `message ${role}`;

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = role === "user" ? "U" : "V";

        const messageContent = document.createElement("div");
        messageContent.className = "message-content";

        const name = document.createElement("div");
        name.className = "message-name";
        name.textContent = role === "user" ? "You" : "Vortex";

        const text = document.createElement("div");
        text.className = "message-text";

        // Render replies as plain text and preserve line breaks.
        text.textContent = content;
        text.style.whiteSpace = "pre-wrap";

        messageContent.append(name, text);
        wrapper.append(avatar, messageContent);
        messages.appendChild(wrapper);
    }

    // RENDER MESSAGES

    function renderMessages() {
        messages.replaceChildren();

        const chat = getCurrentChat();

        if (!chat || chat.messages.length === 0) {
            welcome.style.display = "block";
            return;
        }

        welcome.style.display = "none";

        chat.messages.forEach(message => {
            addMessageToScreen(
                message.role,
                message.content
            );
        });

        // Restore the indicator when returning to a pending chat.
        if (activeRequest?.chatId === chat.id) {
            const typing = document.createElement("div");

            typing.className = "typing";
            typing.textContent = "Vortex is thinking...";

            messages.appendChild(typing);
        }

        scrollToBottom();
    }

    // SEND MESSAGE

    async function sendMessage() {
        const content = messageInput.value.trim();

        if (!content || activeRequest) {
            return;
        }

        if (!getCurrentChat()) {
            createChat();
        }

        const chat = getCurrentChat();

        chat.messages.push({
            role: "user",
            content
        });

        if (chat.title === "New conversation") {
            chat.title = content.substring(0, 30);
        }

        messageInput.value = "";
        messageInput.style.height = "auto";

        const request = {
            chatId: chat.id,
            controller: new AbortController(),
            timedOut: false,
            timeoutId: null
        };

        activeRequest = request;
        sendButton.disabled = true;

        saveConversations();
        renderMessages();
        renderChatList();

        request.timeoutId = window.setTimeout(() => {
            request.timedOut = true;
            request.controller.abort();
        }, CHAT_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                signal: request.controller.signal,
                body: JSON.stringify({
                    message: content,

                    // This includes the latest user message.
                    // The backend should not append it again.
                    history: chat.messages.map(message => ({
                        role: message.role,
                        content: message.content
                    }))
                })
            });

            if (!response.ok) {
                throw new Error(
                    `Server error: ${response.status}`
                );
            }

            const data = await response.json();

            const reply =
                typeof data?.reply === "string"
                    ? data.reply
                    : data?.response;

            if (
                typeof reply !== "string" ||
                !reply.trim()
            ) {
                throw new Error(
                    "Invalid or empty response from Vortex backend."
                );
            }

            // Ignore responses from cancelled requests.
            if (activeRequest !== request) {
                return;
            }

            chat.messages.push({
                role: "assistant",
                content: reply
            });

            saveConversations();
        } catch (error) {
            // Clearing a chat cancels its request silently.
            if (activeRequest !== request) {
                return;
            }

            console.error("Vortex error:", error);

            // Display the error only in the originating chat.
            if (currentChatId === chat.id) {
                activeRequest = null;
                renderMessages();

                let errorMessage;

                if (request.timedOut) {
                    errorMessage =
                        "The request took too long. Please try again.";
                } else if (error instanceof TypeError) {
                    errorMessage =
                        "I couldn't reach the Vortex backend. " +
                        "Check that it is running on port 3001 " +
                        "and allows requests from this page.";
                } else {
                    errorMessage =
                        "Vortex couldn't complete the request. " +
                        "Please check the backend logs and try again.";
                }

                addMessageToScreen("assistant", errorMessage);
                scrollToBottom();
            }
        } finally {
            window.clearTimeout(request.timeoutId);

            if (activeRequest === request) {
                activeRequest = null;

                if (currentChatId === chat.id) {
                    renderMessages();
                }
            }

            // A cancelled older request must not unlock a newer one.
            sendButton.disabled = activeRequest !== null;

            if (
                !activeRequest &&
                currentChatId === chat.id
            ) {
                messageInput.focus();
            }
        }
    }

    // NEW CHAT BUTTON

    newChat.addEventListener("click", event => {
        event.preventDefault();
        createChat();
    });

    // CLEAR CURRENT CHAT

    clearChat.addEventListener("click", event => {
        event.preventDefault();

        const chat = getCurrentChat();

        if (!chat) {
            return;
        }

        // Cancel any response pending for this chat.
        if (activeRequest?.chatId === chat.id) {
            const request = activeRequest;

            activeRequest = null;

            window.clearTimeout(request.timeoutId);
            request.controller.abort();

            sendButton.disabled = false;
        }

        chat.messages = [];
        chat.title = "New conversation";

        saveConversations();
        renderMessages();
        renderChatList();
    });

    // SEND BUTTON

    sendButton.addEventListener("click", event => {
        event.preventDefault();
        void sendMessage();
    });

    // ENTER TO SEND; SHIFT+ENTER FOR A NEW LINE

    messageInput.addEventListener("keydown", event => {
        if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing
        ) {
            event.preventDefault();
            void sendMessage();
        }
    });

    // AUTO RESIZE TEXTAREA

    messageInput.addEventListener("input", () => {
        messageInput.style.height = "auto";

        messageInput.style.height =
            `${Math.min(messageInput.scrollHeight, 150)}px`;
    });

    // SUGGESTIONS

    document.querySelectorAll(".suggestion").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();

            if (activeRequest) {
                return;
            }

            const prompt = button.dataset.prompt;

            if (typeof prompt !== "string" || !prompt.trim()) {
                return;
            }

            messageInput.value = prompt;
            void sendMessage();
        });
    });

    // CHECK BACKEND STATUS

    async function checkConnection() {
        if (isCheckingConnection) {
            return;
        }

        isCheckingConnection = true;

        const controller = new AbortController();

        const timeoutId = window.setTimeout(() => {
            controller.abort();
        }, HEALTH_TIMEOUT_MS);

        try {
            const response = await fetch(`${API_URL}/health`, {
                signal: controller.signal,
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error("Backend unavailable");
            }

            statusDot.classList.remove("offline");
            statusDot.classList.add("online");
            connectionStatus.textContent = "Connected";
        } catch {
            statusDot.classList.remove("online");
            statusDot.classList.add("offline");
            connectionStatus.textContent = "Disconnected";
        } finally {
            window.clearTimeout(timeoutId);
            isCheckingConnection = false;
        }
    }

    // INITIALIZE

    if (conversations.length > 0) {
        currentChatId = conversations[0].id;

        renderMessages();
        renderChatList();
    } else {
        createChat();
    }

    sendButton.disabled = false;

    void checkConnection();

    window.setInterval(() => {
        void checkConnection();
    }, 10000);
}

// Wait until the HTML elements are available.
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeApp,
        { once: true }
    );
} else {
    initializeApp();
}
