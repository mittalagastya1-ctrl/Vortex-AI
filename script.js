const API_URL = "http://localhost:3000";

const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const chatList = document.getElementById("chatList");

const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");

let conversations = JSON.parse(
    localStorage.getItem("vortex_conversations") || "[]"
);

let currentChatId = null;
let isGenerating = false;


// SAVE CONVERSATIONS

function saveConversations() {
    localStorage.setItem(
        "vortex_conversations",
        JSON.stringify(conversations)
    );
}


// CREATE CHAT

function createChat() {

    const chat = {
        id: Date.now().toString(),
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


// CHAT LIST

function renderChatList() {

    chatList.innerHTML = "";

    conversations.forEach(chat => {

        const item = document.createElement("div");

        item.className = "chat-item";

        if (chat.id === currentChatId) {
            item.classList.add("active");
        }

        item.textContent = chat.title;

        item.onclick = () => {

            currentChatId = chat.id;

            renderMessages();
            renderChatList();

        };

        chatList.appendChild(item);

    });

}


// RENDER MESSAGES

function renderMessages() {

    messages.innerHTML = "";

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

    // Safe text rendering
    text.textContent = content;

    messageContent.appendChild(name);
    messageContent.appendChild(text);

    wrapper.appendChild(avatar);
    wrapper.appendChild(messageContent);

    messages.appendChild(wrapper);

    document.getElementById("chatArea").scrollTop =
        document.getElementById("chatArea").scrollHeight;

}


// SEND MESSAGE

async function sendMessage() {

    const content = messageInput.value.trim();

    if (!content || isGenerating) return;

    if (!currentChatId) {
        createChat();
    }

    const chat = getCurrentChat();

    chat.messages.push({
        role: "user",
        content: content
    });

    if (chat.title === "New conversation") {

        chat.title = content.substring(0, 30);

    }

    messageInput.value = "";

    messageInput.style.height = "auto";

    saveConversations();

    renderMessages();
    renderChatList();

    isGenerating = true;

    sendButton.disabled = true;

    const typing = document.createElement("div");

    typing.className = "typing";

    typing.textContent = "Vortex is thinking...";

    messages.appendChild(typing);

    try {

        const response = await fetch(`${API_URL}/api/chat`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                message: content,

                history: chat.messages

            })

        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();

        typing.remove();

        const reply = data.reply || data.response;

        if (typeof reply !== "string") {
            throw new Error("Invalid response from Vortex backend.");
        }

        chat.messages.push({

            role: "assistant",

            content: reply

        });

        saveConversations();

        addMessageToScreen("assistant", reply);

    }

    catch (error) {

        typing.remove();

        console.error("Vortex error:", error);

        addMessageToScreen(
            "assistant",
            "I couldn't connect to my local AI engine. Please check that the Vortex backend and Ollama are running."
        );

    }

    finally {

        isGenerating = false;

        sendButton.disabled = false;

        messageInput.focus();

    }

}


// NEW CHAT BUTTON

document.getElementById("newChat").addEventListener(
    "click",
    createChat
);


// CLEAR CURRENT CHAT

document.getElementById("clearChat").addEventListener(
    "click",
    () => {

        const chat = getCurrentChat();

        if (!chat) return;

        chat.messages = [];

        chat.title = "New conversation";

        saveConversations();

        renderMessages();
        renderChatList();

    }
);


// SEND BUTTON

sendButton.addEventListener(
    "click",
    sendMessage
);


// ENTER TO SEND

messageInput.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {

        event.preventDefault();

        sendMessage();

    }

});


// AUTO RESIZE TEXTAREA

messageInput.addEventListener("input", () => {

    messageInput.style.height = "auto";

    messageInput.style.height =
        Math.min(messageInput.scrollHeight, 150) + "px";

});


// SUGGESTIONS

document.querySelectorAll(".suggestion").forEach(button => {

    button.addEventListener("click", () => {

        messageInput.value = button.dataset.prompt;

        sendMessage();

    });

});


// CHECK BACKEND STATUS

async function checkConnection() {

    try {

        const response = await fetch(`${API_URL}/health`);

        if (!response.ok) {
            throw new Error("Backend unavailable");
        }

        statusDot.className = "status-dot online";

        connectionStatus.textContent = "Connected";

    }

    catch {

        statusDot.className = "status-dot offline";

        connectionStatus.textContent = "Disconnected";

    }

}


// INITIALIZE

function initialize() {

    if (conversations.length > 0) {

        currentChatId = conversations[0].id;

    } else {

        createChat();

    }

    renderMessages();
    renderChatList();

    checkConnection();

    setInterval(checkConnection, 10000);

}

initialize();
