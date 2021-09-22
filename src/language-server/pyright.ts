/**
 * (c) 2021, Micro:bit Educational Foundation and contributors
 *
 * SPDX-License-Identifier: MIT
 */
import { createMessageConnection } from "vscode-jsonrpc";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-jsonrpc/browser";
import { createUri, LanguageServerClient } from "./client";

// This is modified by bin/update-pyright.sh
const workerScriptName = "pyright-7d6fb25c67e8b4ed3eaf.worker.js";

/**
 * Creates Pyright workers and corresponding client.
 *
 * These have the same lifetime as the app.
 */
export const pyright = (): LanguageServerClient | undefined => {
  // For jest.
  if (!window.Worker) {
    return undefined;
  }
  // Needed to support review branches that use a path location.
  const { origin, pathname } = window.location;
  const base = `${origin}${pathname}${pathname.endsWith("/") ? "" : "/"}`;
  const workerScript = `${base}workers/${workerScriptName}`;
  const foreground = new Worker(workerScript, {
    name: "Pyright-foreground",
  });
  foreground.postMessage({
    type: "browser/boot",
    mode: "foreground",
  });
  const connection = createMessageConnection(
    new BrowserMessageReader(foreground),
    new BrowserMessageWriter(foreground)
  );
  let backgroundWorkerCount = 0;
  foreground.addEventListener("message", (e: MessageEvent) => {
    if (e.data && e.data.type === "browser/newWorker") {
      // Create a new background worker.
      // The foreground worker has created a message channel and passed us
      // a port. We create the background worker and pass transfer the port
      // onward.
      const { initialData, port } = e.data;
      const background = new Worker(workerScript, {
        name: `Pyright-background-${++backgroundWorkerCount}`,
      });
      background.postMessage(
        {
          type: "browser/boot",
          mode: "background",
          initialData,
          port,
        },
        [port]
      );
    }
  });
  connection.listen();

  // Must bootstrap before the initialize request so that the config file is in place.
  // Need a better way to do this. Messages before init aren't valid LSP.
  const client = new LanguageServerClient(connection, {
    rootUri: createUri(""),
    initializationOptions: async () => {
      const typeshed = await import("./typeshed.json");
      return {
        files: typeshed,
      };
    },
  });
  return client;
};