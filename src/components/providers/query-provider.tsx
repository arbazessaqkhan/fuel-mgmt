"use client";

import React, { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const CACHE_STORAGE_KEY = "FUELLOG_QUERY_CACHE_V1";
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 30, // 30 seconds fresh window for instant page navigation
          gcTime: ONE_DAY_MS, // Retain in cache for 24 hours
          refetchOnWindowFocus: true, // Refresh when returning to the tab
          refetchOnMount: true, // Automatically fetch latest data on mount if invalidated/stale
          refetchOnReconnect: true,
          retry: 1,
        },
      },
    });
    return client;
  });

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: {
        getItem: (key: string) => {
          if (typeof window !== "undefined") {
            try {
              return window.localStorage.getItem(key);
            } catch {}
          }
          return null;
        },
        setItem: (key: string, value: string) => {
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(key, value);
            } catch {}
          }
        },
        removeItem: (key: string) => {
          if (typeof window !== "undefined") {
            try {
              window.localStorage.removeItem(key);
            } catch {}
          }
        },
      },
      key: CACHE_STORAGE_KEY,
      throttleTime: 0, // Immediately save queries to localStorage upon success
    })
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: ONE_DAY_MS,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === "success",
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
