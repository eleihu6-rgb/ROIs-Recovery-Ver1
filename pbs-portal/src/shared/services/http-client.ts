import axios, { type AxiosInstance } from "axios";
import { readAuthToken } from "@/shared/services/auth-token-storage";

const DEFAULT_API_BASE_URL = "/api";
const DEFAULT_TIMEOUT = 10_000;

export const resolveApiBaseUrl = (rawBaseUrl?: string) => {
  if (!rawBaseUrl) {
    return DEFAULT_API_BASE_URL;
  }

  const normalizedBaseUrl = rawBaseUrl.trim();
  return normalizedBaseUrl.length > 0 ? normalizedBaseUrl : DEFAULT_API_BASE_URL;
};

export const createHttpClient = (baseURL = resolveApiBaseUrl()): AxiosInstance => {
  const client = axios.create({
    baseURL: resolveApiBaseUrl(baseURL),
    withCredentials: true,
    timeout: DEFAULT_TIMEOUT,
  });

  client.interceptors.request.use((config) => {
    const token = readAuthToken();

    if (!token) {
      return config;
    }

    const headers = axios.AxiosHeaders.from(config.headers);

    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    config.headers = headers;
    return config;
  });

  return client;
};
