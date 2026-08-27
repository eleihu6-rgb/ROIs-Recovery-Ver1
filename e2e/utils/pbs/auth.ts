import { constants, publicEncrypt } from 'node:crypto'
import { type APIRequestContext, expect } from '@playwright/test'

type PbsPasswordPublicKeyResponse = {
  keyId: string
  algorithm: 'RSA-OAEP-256'
  publicKeyPem: string
}

type PbsLoginResponse = {
  token: string
  user: Record<string, unknown>
  authMode: string
}

type PbsResponseEnvelope<T> = {
  code?: number
  data?: T | null
}

const normalizePbsApiBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

const unwrapEnvelope = <T>(body: T | PbsResponseEnvelope<T>): T => {
  if (
    body
    && typeof body === 'object'
    && 'data' in body
    && (body as PbsResponseEnvelope<T>).data
  ) {
    return (body as PbsResponseEnvelope<T>).data as T
  }

  return body as T
}

const encryptPassword = (
  publicKey: PbsPasswordPublicKeyResponse,
  password: string,
): string => {
  return publicEncrypt(
    {
      key: publicKey.publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(password, 'utf8'),
  ).toString('base64')
}

export const buildEncryptedPbsLoginPayload = async (
  request: APIRequestContext,
  baseUrl: string,
  userCode: string,
  password: string,
) => {
  const apiBaseUrl = normalizePbsApiBaseUrl(baseUrl)
  const keyResponse = await request.get(`${apiBaseUrl}/auth/password-public-key`)
  expect(keyResponse.ok(), `PBS password public key failed: ${keyResponse.status()}`).toBeTruthy()

  const publicKey = unwrapEnvelope<PbsPasswordPublicKeyResponse>(
    await keyResponse.json(),
  )
  expect(publicKey.algorithm).toBe('RSA-OAEP-256')
  expect(publicKey.keyId).toBeTruthy()
  expect(publicKey.publicKeyPem).toContain('BEGIN PUBLIC KEY')

  return {
    userCode,
    encryptedPassword: encryptPassword(publicKey, password),
    encryption: {
      algorithm: publicKey.algorithm,
      keyId: publicKey.keyId,
    },
  }
}

export const loginToPbsApi = async (
  request: APIRequestContext,
  baseUrl: string,
  userCode: string,
  password: string,
  authPath = '/auth/session',
): Promise<PbsLoginResponse> => {
  const apiBaseUrl = normalizePbsApiBaseUrl(baseUrl)
  const payload = await buildEncryptedPbsLoginPayload(
    request,
    apiBaseUrl,
    userCode,
    password,
  )
  const response = await request.post(`${apiBaseUrl}${authPath}`, {
    data: payload,
  })

  expect(response.ok(), `PBS login failed: ${response.status()}`).toBeTruthy()
  const loginResponse = unwrapEnvelope<PbsLoginResponse>(await response.json())
  expect(loginResponse.token, 'login response missing token').toBeTruthy()
  return loginResponse
}
