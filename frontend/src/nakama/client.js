import { Client } from "@heroiclabs/nakama-js";
import { v4 as uuidv4 } from "uuid";

const DEVICE_ID_STORAGE_KEY = "nakama_device_id";
const SESSION_STORAGE_KEY = "lila_session_encrypted";
const ENCRYPTION_SALT = "lila_tic_tac_toe_2026"; // Static salt for key derivation

// In production, replace localhost with the URL of your deployed Nakama server.
const client = new Client("defaultkey", "127.0.0.1", "7350", false);

// Encryption utilities using Web Crypto API
async function deriveEncryptionKey() {
  const encoder = new TextEncoder();
  const saltBuffer = encoder.encode(ENCRYPTION_SALT);
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_SALT),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptSessionData(data) {
  try {
    const key = await deriveEncryptionKey();
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedData), iv.length);

    // Convert to base64
    return btoa(String.fromCharCode.apply(null, combined));
  } catch (error) {
    console.error("Encryption error:", error);
    return null;
  }
}

async function decryptSessionData(encryptedBase64) {
  try {
    const key = await deriveEncryptionKey();
    // Decode base64
    const binaryString = atob(encryptedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Extract IV and encrypted data
    const iv = bytes.slice(0, 12);
    const encryptedData = bytes.slice(12);

    // Decrypt
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );

    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decrypted);
    return JSON.parse(plaintext);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

// Save encrypted session to localStorage (auth data only, no stats)
async function saveSessionToStorage(session, username) {
  try {
    const sessionData = {
      token: session.token,
      refreshToken: session.refresh_token || session.refreshToken,
      userId: session.user_id || session.userId,
      username: username,
      createdAt: Date.now(),
    };
    const encrypted = await encryptSessionData(sessionData);
    if (encrypted) {
      localStorage.setItem(SESSION_STORAGE_KEY, encrypted);
    }
  } catch (error) {
    console.error("Failed to save session:", error);
  }
}

// Restore encrypted session from localStorage
export async function restoreSessionFromStorage() {
  try {
    const encrypted = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!encrypted) {
      return null;
    }

    const decrypted = await decryptSessionData(encrypted);
    if (!decrypted || !decrypted.token) {
      return null;
    }

    // Recreate session object with SDK-compatible method names.
    function toNowSeconds(input) {
      if (typeof input === "number" && Number.isFinite(input)) {
        // Accept both milliseconds and seconds.
        return input > 1000000000000 ? Math.floor(input / 1000) : Math.floor(input);
      }

      if (input && typeof input.getTime === "function") {
        return Math.floor(input.getTime() / 1000);
      }

      return Math.floor(Date.now() / 1000);
    }

    const expiresAt = Math.floor((Date.now() + 7200000) / 1000);
    const refreshExpiresAt = Math.floor((Date.now() + 604800000) / 1000);
    const session = {
      token: decrypted.token,
      refresh_token: decrypted.refreshToken,
      user_id: decrypted.userId,
      username: decrypted.username,
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
      isexpired(date) {
        const nowSeconds = toNowSeconds(date);
        return nowSeconds > this.expires_at;
      },
      isrefreshexpired(date) {
        const nowSeconds = toNowSeconds(date);
        return nowSeconds > this.refresh_expires_at;
      },
      // Compatibility aliases for app code that may call camelCase variants.
      isExpired(date) {
        return this.isexpired(date);
      },
      isRefreshExpired(date) {
        return this.isrefreshexpired(date);
      },
    };

    // Validate restored session against server to prevent stale-token issues
    // (for example after database resets).
    try {
      await client.getAccount(session);
    } catch (validationError) {
      clearSessionStorage();
      return null;
    }

    return {
      session,
      username: decrypted.username,
    };
  } catch (error) {
    console.error("Failed to restore session:", error);
    return null;
  }
}

// Clear session from localStorage (logout)
export function clearSessionStorage() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
}

export function normalizeUsername(value) {
  return String(value || "").trim();
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const id = uuidv4();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

export async function authenticateDevice(displayName) {
  const deviceId = getOrCreateDeviceId();
  const username = normalizeUsername(displayName);

  if (!username) {
    throw new Error("Username is required.");
  }

  // First auth creates account for new device ids.
  const initialSession = await client.authenticateDevice(deviceId, true, username, {
    displayName: username,
  });

  const account = await client.getAccount(initialSession);
  const currentUsername = normalizeUsername(account?.user?.username);

  if (currentUsername !== username) {
    await client.updateAccount(initialSession, {
      username,
      display_name: username,
    });
  }

  // Re-auth to refresh session claims (username) used by realtime socket presence.
  const refreshedSession = await client.authenticateDevice(deviceId, false, username, {
    displayName: username,
  });

  // Save encrypted session to localStorage (no stats data)
  await saveSessionToStorage(refreshedSession, username);

  return {
    session: refreshedSession,
    username,
  };
}

function toLocalEmail(username) {
  return `${username.toLowerCase()}@lila.local`;
}

function isAccountNotFoundError(error) {
  var message = String(error?.message || "").toLowerCase();
  return (
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("404")
  );
}

function isUsernameTakenError(error) {
  var message = String(error?.message || "").toLowerCase();
  return (
    (message.includes("username") && message.includes("already")) ||
    message.includes("username is already") ||
    message.includes("username already")
  );
}

function isInvalidCredentialsError(error) {
  var message = String(error?.message || "").toLowerCase();
  return message.includes("invalid") && message.includes("credential");
}

export async function authenticateWithPassword(displayName, password) {
  const username = normalizeUsername(displayName);
  const secret = String(password || "");

  if (!username) {
    throw new Error("Username is required.");
  }

  if (!secret) {
    throw new Error("Password is required.");
  }

  if (secret.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const email = toLocalEmail(username);
  let session = null;

  try {
    session = await client.authenticateEmail(email, secret, false, username, {
      displayName: username,
    });
  } catch (loginError) {
    if (isInvalidCredentialsError(loginError)) {
      throw new Error("Invalid username/password.");
    }

    if (!isAccountNotFoundError(loginError)) {
      throw loginError;
    }

    try {
      session = await client.authenticateEmail(email, secret, true, username, {
        displayName: username,
      });
    } catch (createError) {
      if (!isUsernameTakenError(createError)) {
        throw createError;
      }

      // Migrate current browser's device account to password auth when username already exists.
      const deviceId = getOrCreateDeviceId();
      let deviceSession = null;

      try {
        deviceSession = await client.authenticateDevice(deviceId, false, username, {
          displayName: username,
        });
      } catch (deviceError) {
        throw new Error(
          "This username already exists on another account. Use the original password for this username."
        );
      }

      const account = await client.getAccount(deviceSession);
      const deviceUsername = normalizeUsername(account?.user?.username);

      if (deviceUsername !== username) {
        throw new Error(
          "This username already exists on another account. Use the original password for this username."
        );
      }

      await client.updateAccount(deviceSession, {
        email,
        password: secret,
        username,
        display_name: username,
      });

      session = await client.authenticateEmail(email, secret, false, username, {
        displayName: username,
      });
    }
  }

  const account = await client.getAccount(session);
  const currentUsername = normalizeUsername(account?.user?.username);

  if (currentUsername !== username) {
    await client.updateAccount(session, {
      username,
      display_name: username,
    });
  }

  const refreshedSession = await client.authenticateEmail(email, secret, false, username, {
    displayName: username,
  });

  // Save encrypted session to localStorage (no stats data)
  await saveSessionToStorage(refreshedSession, username);

  return {
    session: refreshedSession,
    username,
  };
}

export default client;
