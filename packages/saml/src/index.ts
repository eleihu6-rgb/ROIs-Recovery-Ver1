import * as nodeSaml from "@node-saml/node-saml";

export type SamlSpConfig = {
  callbackUrl: string;          // 绝对 ACS URL（Azure Reply URL，必须一致）
  entryPoint: string;           // Azure SSO endpoint：https://login.microsoftonline.com/<tenant-id>/saml2
  issuer: string;               // SP Entity ID：urn:rois:gantt-sso / urn:rois:pbs-sso
  idpCert: string;              // Azure SAML 签名证书（base64）
  privateKey?: string;          // SP 私钥 PEM（签名 AuthnRequest）
  publicCert?: string;          // SP 证书 PEM（metadata / 签名校验）
  wantAssertionsSigned: boolean;
  acceptedClockSkewMs: number;
  validateInResponseTo: "always" | "never" | "ifPresent";
};

export type SamlIdentity = {
  email?: string;
  userCode?: string;
};

export type SamlProfile = nodeSaml.Profile;

const VALIDATE_IN_RESPONSE_TO: Record<
  SamlSpConfig["validateInResponseTo"],
  nodeSaml.ValidateInResponseTo
> = {
  always: nodeSaml.ValidateInResponseTo.always,
  never: nodeSaml.ValidateInResponseTo.never,
  ifPresent: nodeSaml.ValidateInResponseTo.ifPresent,
};

export function createSamlSp(config: SamlSpConfig): nodeSaml.SAML {
  return new nodeSaml.SAML({
    callbackUrl: config.callbackUrl,
    entryPoint: config.entryPoint,
    issuer: config.issuer,
    idpCert: config.idpCert,
    privateKey: config.privateKey,
    publicCert: config.publicCert,
    wantAssertionsSigned: config.wantAssertionsSigned,
    // Azure 企业应用默认只签 SAML Assertion、不签顶层 Response。node-saml 默认
    // `wantAuthnResponseSigned: true` 会要求 Response 级签名 → 抛 "Invalid document signature"，
    // 必须显式关掉；Assertion 签名仍由 wantAssertionsSigned 强制校验，安全性不降级。
    wantAuthnResponseSigned: false,
    acceptedClockSkewMs: config.acceptedClockSkewMs,
    validateInResponseTo: VALIDATE_IN_RESPONSE_TO[config.validateInResponseTo],
    signatureAlgorithm: "sha256",
  });
}

export async function getAuthorizeUrl(saml: nodeSaml.SAML, relayState?: string): Promise<string> {
  return saml.getAuthorizeUrlAsync(relayState ?? "", undefined, {});
}

export async function validatePostResponse(
  saml: nodeSaml.SAML,
  samlResponse: string,
): Promise<{ profile: nodeSaml.Profile | null; loggedOut: boolean }> {
  return saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
}

export function generateMetadata(saml: nodeSaml.SAML): string {
  return saml.generateServiceProviderMetadata(null, saml.options.publicCert ?? null);
}

export function extractIdentity(
  profile: SamlProfile,
  attrMap: { emailAttrs: string[]; userCodeAttrs: string[] },
): SamlIdentity {
  const pick = (attrs: string[]): string | undefined => {
    for (const attr of attrs) {
      const value = profile[attr];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    return undefined;
  };
  const email = pick([...attrMap.emailAttrs, "email", "mail"]);
  const userCode = pick(attrMap.userCodeAttrs);
  return { email, userCode };
}
