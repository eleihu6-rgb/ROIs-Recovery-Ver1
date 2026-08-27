"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSamlSp = createSamlSp;
exports.getAuthorizeUrl = getAuthorizeUrl;
exports.validatePostResponse = validatePostResponse;
exports.generateMetadata = generateMetadata;
exports.extractIdentity = extractIdentity;
const nodeSaml = __importStar(require("@node-saml/node-saml"));
const VALIDATE_IN_RESPONSE_TO = {
    always: nodeSaml.ValidateInResponseTo.always,
    never: nodeSaml.ValidateInResponseTo.never,
    ifPresent: nodeSaml.ValidateInResponseTo.ifPresent,
};
function createSamlSp(config) {
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
async function getAuthorizeUrl(saml, relayState) {
    return saml.getAuthorizeUrlAsync(relayState ?? "", undefined, {});
}
async function validatePostResponse(saml, samlResponse) {
    return saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
}
function generateMetadata(saml) {
    return saml.generateServiceProviderMetadata(null, saml.options.publicCert ?? null);
}
function extractIdentity(profile, attrMap) {
    const pick = (attrs) => {
        for (const attr of attrs) {
            const value = profile[attr];
            if (typeof value === "string" && value.trim() !== "")
                return value.trim();
        }
        return undefined;
    };
    const email = pick([...attrMap.emailAttrs, "email", "mail"]);
    const userCode = pick(attrMap.userCodeAttrs);
    return { email, userCode };
}
