import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("DocumentFormComponent complies with canonical sidebar drawer animation contract", async () => {
  const source = await readFile(
    new URL("../src/components/document/DocumentFormComponent.jsx", import.meta.url),
    "utf8",
  );

  // Transition and duration classes
  assert.ok(source.includes("transition-transform duration-200 ease-out"), "Aside must have 200ms ease-out transform transition");
  assert.ok(source.includes("transition-opacity duration-200 ease-out"), "Backdrop must have 200ms ease-out opacity transition");
  assert.ok(source.includes("starting:translate-x-full"), "Aside must support CSS starting-style translate-x-full");
  assert.ok(source.includes("starting:opacity-0"), "Backdrop must support CSS starting-style opacity-0");

  // State-driven translate classes
  assert.ok(source.includes('active && !closing ? "translate-x-0" : "translate-x-full"'), "Aside must slide to translate-x-0 when active and translate-x-full when closing");
  assert.ok(source.includes('active && !closing ? "opacity-100" : "opacity-0 pointer-events-none"'), "Backdrop must fade to opacity-100 when active and opacity-0 when closing");

  // Entry animation trigger using requestAnimationFrame
  assert.ok(source.includes("requestAnimationFrame(() => setActive(true))"), "Must trigger active state using requestAnimationFrame on mount");

  // Exit animation delay and double-click guard
  assert.ok(source.includes("closeRef.current = true;"), "Must guard close against duplicate invocations");
  assert.ok(source.includes("setClosing(true);"), "Must set closing state before unmounting");
  assert.ok(source.includes("setTimeout(() => {"), "Must delay unmount callback");
  assert.ok(source.includes("200);"), "Timeout duration must match 200ms transition");

  // Escape key handler invoking handleClose
  assert.ok(source.includes('event.key === "Escape" && !submitting) handleClose()'), "Escape key must trigger handleClose");

  // Close triggers invoke handleClose
  assert.ok(source.includes("onClick={handleClose}"), "Close buttons and backdrop must invoke handleClose");
});

test("IncomingInvoiceFormComponent complies with canonical sidebar drawer animation contract", async () => {
  const source = await readFile(
    new URL("../src/components/incomingInvoice/IncomingInvoiceFormComponent.jsx", import.meta.url),
    "utf8",
  );

  // Transition and duration classes
  assert.ok(source.includes("transition-transform duration-200 ease-out"), "Aside must have 200ms ease-out transform transition");
  assert.ok(source.includes("transition-opacity duration-200 ease-out"), "Backdrop must have 200ms ease-out opacity transition");
  assert.ok(source.includes("starting:translate-x-full"), "Aside must support CSS starting-style translate-x-full");
  assert.ok(source.includes("starting:opacity-0"), "Backdrop must support CSS starting-style opacity-0");

  // State-driven translate classes
  assert.ok(source.includes('active && !closing ? "translate-x-0" : "translate-x-full"'), "Aside must slide to translate-x-0 when active and translate-x-full when closing");
  assert.ok(source.includes('active && !closing ? "opacity-100" : "opacity-0 pointer-events-none"'), "Backdrop must fade to opacity-100 when active and opacity-0 when closing");

  // Entry animation trigger using requestAnimationFrame
  assert.ok(source.includes("requestAnimationFrame(() => setActive(true))"), "Must trigger active state using requestAnimationFrame on mount");

  // Exit animation delay and double-click guard
  assert.ok(source.includes("closeRef.current = true;"), "Must guard close against duplicate invocations");
  assert.ok(source.includes("setClosing(true);"), "Must set closing state before unmounting");
  assert.ok(source.includes("setTimeout(() => {"), "Must delay unmount callback");
  assert.ok(source.includes("200);"), "Timeout duration must match 200ms transition");

  // Escape key handler invoking handleClose
  assert.ok(source.includes('event.key === "Escape" && !submitting) handleClose()'), "Escape key must trigger handleClose");

  // Close triggers invoke handleClose
  assert.ok(source.includes("onClick={handleClose}"), "Close buttons and backdrop must invoke handleClose");
});
