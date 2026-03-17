const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const DEFAULT_MATCH_ENGINE_FUNCTION = "match-engine";

const normalizeEnvValue = (value?: string) => {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
};

const isLocalSupabaseUrl = (url: string) =>
  url.includes("127.0.0.1") || url.includes("localhost");

const buildFunctionUrl = (functionName: string) => {
  const baseUrl = normalizeEnvValue(SUPABASE_URL).replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("VITE_SUPABASE_URL is not configured");
  }

  return `${baseUrl}/functions/v1/${functionName}`;
};

const getConfiguredPrimaryFunction = () =>
  normalizeEnvValue(import.meta.env.VITE_MATCH_ENGINE_FUNCTION) || DEFAULT_MATCH_ENGINE_FUNCTION;

const getConfiguredLocalFunction = () =>
  normalizeEnvValue(import.meta.env.VITE_MATCH_ENGINE_LOCAL_FUNCTION);

const getConfiguredFallbackFunction = () =>
  normalizeEnvValue(import.meta.env.VITE_MATCH_ENGINE_FALLBACK_FUNCTION);

export function getInitialMatchEngineFunction() {
  const baseUrl = normalizeEnvValue(SUPABASE_URL);
  const localFunction = getConfiguredLocalFunction();

  if (baseUrl && isLocalSupabaseUrl(baseUrl) && localFunction) {
    return localFunction;
  }

  return getConfiguredPrimaryFunction();
}

type InvokeConfiguredMatchEngineParams = {
  body: Record<string, unknown>;
  accessToken?: string;
  onServerNow?: (serverTimestamp: number) => void;
  resolvedFunctionRef?: { current: string };
};

export async function invokeConfiguredMatchEngine<T = Record<string, unknown>>(
  params: InvokeConfiguredMatchEngineParams,
) {
  const { body, accessToken, onServerNow, resolvedFunctionRef } = params;
  let resolvedFunction = resolvedFunctionRef?.current || getInitialMatchEngineFunction();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const callFunction = async (functionName: string) => {
    const response = await fetch(buildFunctionUrl(functionName), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    let result: T = {} as T;
    try {
      result = await response.json();
    } catch {
      if (!response.ok) {
        result = { error: `HTTP ${response.status}` } as T;
      }
    }

    return { response, result };
  };

  let payload = await callFunction(resolvedFunction);
  const fallbackFunction = getConfiguredFallbackFunction();

  if (payload.response.status === 404 && fallbackFunction && fallbackFunction !== resolvedFunction) {
    resolvedFunction = fallbackFunction;
    payload = await callFunction(resolvedFunction);
  }

  if (resolvedFunctionRef) {
    resolvedFunctionRef.current = resolvedFunction;
  }

  const serverNow = (payload.result as { server_now?: unknown })?.server_now;
  if (typeof serverNow === "number") {
    onServerNow?.(serverNow);
  }

  return {
    ...payload,
    resolvedFunction,
  };
}
