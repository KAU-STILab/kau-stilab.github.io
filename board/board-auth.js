(() => {
  "use strict";

  const encryptedContentPath = "./board-content.enc.json";
  const loginForm = document.querySelector("#board-login");
  const passwordInput = document.querySelector("#board-password");
  const submitButton = document.querySelector("#board-submit");
  const errorMessage = document.querySelector("#board-error");
  const boardContent = document.querySelector("#board-content");
  const boardFrame = document.querySelector("#notion-board-frame");

  if (!loginForm || !passwordInput || !submitButton || !errorMessage || !boardContent || !boardFrame) {
    return;
  }

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder("utf-8", { fatal: true });

  function decodeBase64(value) {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function macInput(data) {
    return `${data.version}.${data.iterations}.${data.salt}.${data.iv}.${data.ciphertext}`;
  }

  async function deriveKeys(password, salt, iterations) {
    const passwordBytes = textEncoder.encode(password.normalize("NFC"));
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations
      },
      keyMaterial,
      512
    );

    passwordBytes.fill(0);
    const keyBytes = new Uint8Array(bits);
    const encryptionKeyBytes = keyBytes.slice(0, 32);
    const authenticationKeyBytes = keyBytes.slice(32, 64);
    keyBytes.fill(0);

    const encryptionKey = await crypto.subtle.importKey(
      "raw",
      encryptionKeyBytes,
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );

    const authenticationKey = await crypto.subtle.importKey(
      "raw",
      authenticationKeyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    encryptionKeyBytes.fill(0);
    authenticationKeyBytes.fill(0);
    return { encryptionKey, authenticationKey };
  }

  function validateEnvelope(data) {
    return data
      && data.version === 1
      && data.algorithm === "AES-256-CBC+HMAC-SHA-256"
      && data.kdf === "PBKDF2-SHA-256"
      && Number.isInteger(data.iterations)
      && data.iterations >= 100000
      && typeof data.salt === "string"
      && typeof data.iv === "string"
      && typeof data.ciphertext === "string"
      && typeof data.mac === "string";
  }

  function validatePayload(payload) {
    if (!payload || typeof payload.notionUrl !== "string") {
      throw new Error("Invalid board payload.");
    }

    const notionUrl = new URL(payload.notionUrl);
    if (notionUrl.protocol !== "https:" || !notionUrl.hostname.endsWith(".notion.site")) {
      throw new Error("Invalid board destination.");
    }

    return notionUrl.href;
  }

  async function unlockBoard(password) {
    const response = await fetch(encryptedContentPath, { cache: "no-store" });
    if (!response.ok) throw new Error("Encrypted board content could not be loaded.");

    const data = await response.json();
    if (!validateEnvelope(data)) throw new Error("Invalid encrypted board data.");

    const salt = decodeBase64(data.salt);
    const iv = decodeBase64(data.iv);
    const ciphertext = decodeBase64(data.ciphertext);
    const expectedMac = decodeBase64(data.mac);
    const { encryptionKey, authenticationKey } = await deriveKeys(password, salt, data.iterations);

    const isAuthentic = await crypto.subtle.verify(
      "HMAC",
      authenticationKey,
      expectedMac,
      textEncoder.encode(macInput(data))
    );

    if (!isAuthentic) throw new Error("Authentication failed.");

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv },
      encryptionKey,
      ciphertext
    );

    const payload = JSON.parse(textDecoder.decode(plaintext));
    return validatePayload(payload);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Checking";

    try {
      if (!window.crypto?.subtle) {
        throw new Error("Web Crypto is unavailable.");
      }

      const notionUrl = await unlockBoard(passwordInput.value);
      passwordInput.value = "";
      boardFrame.src = notionUrl;
      loginForm.hidden = true;
      boardContent.hidden = false;
      boardContent.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      passwordInput.value = "";
      passwordInput.focus();
      errorMessage.textContent = "The password is incorrect or the protected board could not be opened.";
      console.warn("Board unlock failed.", error);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Enter";
    }
  });
})();
