import type { AxiosRequestConfig } from "axios";
import { env } from "@/shared/config/env";
import { createHttpClient } from "@/shared/services/http-client";

type RequestParams = Record<string, string | number | boolean | null | undefined>;

type RequestOptions = Pick<AxiosRequestConfig, "signal" | "headers" | "timeout"> & {
  params?: RequestParams;
};

const client = createHttpClient(env.apiBaseUrl);

const unwrapResponse = async <T>(
  requestPromise: Promise<{ data: T }>,
): Promise<T> => {
  const response = await requestPromise;
  const payload = response.data as T | { code: number; data: T; message: string };

  if (
    payload
    && typeof payload === "object"
    && "code" in payload
    && "data" in payload
  ) {
    return payload.data;
  }

  return response.data;
};

export const request = {
  get: <T>(url: string, options?: RequestOptions) => {
    return unwrapResponse(client.get<T>(url, options));
  },
  post: <TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: RequestOptions,
  ) => {
    return unwrapResponse(client.post<TResponse>(url, body, options));
  },
  put: <TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: RequestOptions,
  ) => {
    return unwrapResponse(client.put<TResponse>(url, body, options));
  },
  patch: <TResponse, TBody = unknown>(
    url: string,
    body?: TBody,
    options?: RequestOptions,
  ) => {
    return unwrapResponse(client.patch<TResponse>(url, body, options));
  },
  delete: <TResponse>(url: string, options?: RequestOptions) => {
    return unwrapResponse(client.delete<TResponse>(url, options));
  },
};

export type { RequestOptions, RequestParams };
