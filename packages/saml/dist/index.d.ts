import * as nodeSaml from "@node-saml/node-saml";
export type SamlSpConfig = {
    callbackUrl: string;
    entryPoint: string;
    issuer: string;
    idpCert: string;
    privateKey?: string;
    publicCert?: string;
    wantAssertionsSigned: boolean;
    acceptedClockSkewMs: number;
    validateInResponseTo: "always" | "never" | "ifPresent";
};
export type SamlIdentity = {
    email?: string;
    userCode?: string;
};
export type SamlProfile = nodeSaml.Profile;
export declare function createSamlSp(config: SamlSpConfig): nodeSaml.SAML;
export declare function getAuthorizeUrl(saml: nodeSaml.SAML, relayState?: string): Promise<string>;
export declare function validatePostResponse(saml: nodeSaml.SAML, samlResponse: string): Promise<{
    profile: nodeSaml.Profile | null;
    loggedOut: boolean;
}>;
export declare function generateMetadata(saml: nodeSaml.SAML): string;
export declare function extractIdentity(profile: SamlProfile, attrMap: {
    emailAttrs: string[];
    userCodeAttrs: string[];
}): SamlIdentity;
