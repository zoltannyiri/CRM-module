import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = new EventTarget();
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
}

const { default: apiClient, authClient } = await import("../src/api/apiClient.js");

test("parallel 401 responses share one refresh and retry with the new token", async () => {
  localStorage.setItem("accessToken", "expired-token");
  let refreshCalls = 0;
  let protectedCalls = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve;
  });

  authClient.defaults.adapter = async (config) => {
    refreshCalls += 1;
    await refreshGate;
    return {
      data: { accessToken: "fresh-token" },
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    };
  };

  apiClient.defaults.adapter = async (config) => {
    protectedCalls += 1;
    if (config.headers.Authorization === "Bearer fresh-token") {
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    }

    return Promise.reject({
      config,
      response: { status: 401, data: { message: "expired" } },
    });
  };

  const requests = Array.from({ length: 5 }, () => apiClient.get("/partners"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(refreshCalls, 1);
  releaseRefresh();

  const responses = await Promise.all(requests);
  assert.ok(responses.every(({ data }) => data.ok));
  assert.equal(refreshCalls, 1);
  assert.equal(protectedCalls, 10);
  assert.equal(localStorage.getItem("accessToken"), "fresh-token");
});
