import {
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCredentialAutofillSync } from "@rois/ui";
import loginBackgroundSrc from "@/assets/images/login-background.png";
import loginLogoSrc from "@/assets/images/login-logo.png";
import topbarSrc from "@/assets/images/login-topbar.png";
import {
  clearAuthReturnTo,
  normalizeAuthReturnTo,
  readAuthReturnTo,
  storeAuthReturnTo,
} from "@/app/router/auth-return-to";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";
import { env } from "@/shared/config/env";

let inflightSsoToken: string | null = null;
let inflightSimulatedLogin = false;
const pbsLoginFormAction = `${env.apiBaseUrl.replace(/\/+$/, "")}/auth/session`;
const PBS_USER_CODE_FIELD = "pbsPortalUserCode";
const PBS_PASSWORD_FIELD = "pbsPortalPassword";

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const buildSanitizedLoginPath = (nextPath: string) => {
  const nextSearch = new URLSearchParams();

  if (nextPath !== "/dashboard") {
    nextSearch.set("redirect", nextPath);
  }

  const search = nextSearch.toString();

  return search ? `/login?${search}` : "/login";
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const status = useAuthSessionStore((state) => state.status);
  const login = useAuthSessionStore((state) => state.login);
  const completeSsoFromToken = useAuthSessionStore((state) => state.completeSsoFromToken);
  const completeSimulatedLogin = useAuthSessionStore((state) => state.completeSimulatedLogin);
  const redirectToSsoLogin = useAuthSessionStore((state) => state.redirectToSsoLogin);
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [userCodeError, setUserCodeError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useCredentialAutofillSync({
    formRef,
    fields: [
      { name: PBS_USER_CODE_FIELD, value: userCode, onValueChange: setUserCode },
      { name: PBS_PASSWORD_FIELD, value: password, onValueChange: setPassword },
    ],
  });

  const token = searchParams.get("token")?.trim() ?? "";
  const simulate = searchParams.get("simulate") === "1";
  const legacySimulateTokenPresent = searchParams.has("simulateToken");
  const redirectParam = searchParams.get("redirect");
  const nextPath = useMemo(() => {
    if (redirectParam) {
      return normalizeAuthReturnTo(redirectParam);
    }

    return readAuthReturnTo();
  }, [redirectParam]);

  useEffect(() => {
    if (!token && !simulate && !legacySimulateTokenPresent && !redirectParam) {
      clearAuthReturnTo();
    }
  }, [legacySimulateTokenPresent, redirectParam, simulate, token]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    clearAuthReturnTo();
    navigate(nextPath, { replace: true });
  }, [navigate, nextPath, status]);

  useEffect(() => {
    if (!token || inflightSsoToken === token) {
      return;
    }

    inflightSsoToken = token;
    storeAuthReturnTo(nextPath);
    navigate(buildSanitizedLoginPath(nextPath), { replace: true });
    setSubmissionError("");
    setIsSubmitting(true);

    void completeSsoFromToken(token)
      .catch((error) => {
        setSubmissionError(
          resolveErrorMessage(error, "SSO login failed. Please try again."),
        );
      })
      .finally(() => {
        inflightSsoToken = null;
        setIsSubmitting(false);
      });
  }, [completeSsoFromToken, navigate, nextPath, token]);

  useEffect(() => {
    if (!legacySimulateTokenPresent) {
      return;
    }

    storeAuthReturnTo(nextPath);
    navigate(buildSanitizedLoginPath(nextPath), { replace: true });
    setSubmissionError("This simulated login link is no longer supported. Please generate a new link from Admin.");
  }, [legacySimulateTokenPresent, navigate, nextPath]);

  useEffect(() => {
    if (!simulate || legacySimulateTokenPresent || inflightSimulatedLogin) {
      return;
    }

    inflightSimulatedLogin = true;
    storeAuthReturnTo(nextPath);
    navigate(buildSanitizedLoginPath(nextPath), { replace: true });
    setSubmissionError("");
    setIsSubmitting(true);

    void completeSimulatedLogin()
      .catch((error) => {
        setSubmissionError(
          resolveErrorMessage(error, "Simulated login failed. Please try again."),
        );
      })
      .finally(() => {
        inflightSimulatedLogin = false;
        setIsSubmitting(false);
      });
  }, [completeSimulatedLogin, legacySimulateTokenPresent, navigate, nextPath, simulate]);

  const validateForm = () => {
    const trimmedUserCode = userCode.trim();
    let isValid = true;

    if (!trimmedUserCode) {
      setUserCodeError("Please enter your user code.");
      isValid = false;
    } else {
      setUserCodeError("");
    }

    if (!password) {
      setPasswordError("Please enter your password.");
      isValid = false;
    } else {
      setPasswordError("");
    }

    return isValid;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    storeAuthReturnTo(nextPath);
    setSubmissionError("");
    setIsSubmitting(true);

    try {
      await login({ userCode: userCode.trim(), password });
    } catch (error) {
      setSubmissionError(
        resolveErrorMessage(error, "Login failed. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSsoSubmit = () => {
    if (isSubmitting) {
      return;
    }

    storeAuthReturnTo(nextPath);
    redirectToSsoLogin();
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${loginBackgroundSrc}')` }}
    >
      <header className="h-[55px]">
        <img
          alt="Flair Airlines"
          className="block h-full min-w-full w-auto object-cover object-left"
          src={topbarSrc}
        />
      </header>

      <main className="flex min-h-[calc(100vh-55px)] items-center justify-center bg-black/15 px-4 py-6">
        <section className="h-[580px] w-[560px] rounded-xl bg-[rgb(255_255_255_/_0.8)] px-[100px] pb-[100px] pt-[98px] shadow-[0_24px_60px_rgba(0,0,0,0.12)]">
          <h1 className="sr-only">Sign in</h1>
          <div className="mx-auto mb-[45px] flex h-[43px] w-[292px] items-start">
            <img
              alt="Flair"
              className="mt-[2px] h-[36px] w-[109px] object-contain"
              src={loginLogoSrc}
            />
            <span className="ml-4 mt-[11px] h-[19px] w-px bg-[rgb(12_36_61_/_25%)]" />
            <span className="ml-[15px] whitespace-nowrap text-2xl font-semibold leading-[43px] text-black">
              ROIS CREW
            </span>
          </div>

          <form
            ref={formRef}
            id="pbs-portal-login-form"
            name="pbs-portal-login-form"
            action={pbsLoginFormAction}
            autoComplete="on"
            className="space-y-1"
            method="post"
            onSubmit={handleSubmit}
          >
            <div>
              <label className="relative block">
                <UserIcon className="pointer-events-none absolute left-6 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-black/85" />
                <Input
                  aria-label="User Code"
                  autoComplete="section-pbs username"
                  className="h-14 rounded-lg border-0 bg-white px-0 py-0 pl-[58px] pr-6 text-base leading-[26px] text-black/85 shadow-none placeholder:text-black/25 focus-visible:ring-2 focus-visible:ring-[#706cd5]/20 focus-visible:ring-offset-0"
                  name={PBS_USER_CODE_FIELD}
                  placeholder="User Code"
                  value={userCode}
                  onBlur={() => {
                    if (!userCode.trim()) {
                      setUserCodeError("Please enter your user code.");
                    }
                  }}
                  onChange={(event) => {
                    setUserCode(event.target.value);
                    if (userCodeError) {
                      setUserCodeError("");
                    }
                  }}
                />
              </label>
              <p className="mt-1 min-h-4 px-1 text-xs leading-4 text-[#da6464]">
                {userCodeError}
              </p>
            </div>

            <div>
              <label className="relative block">
                <LockClosedIcon className="pointer-events-none absolute left-6 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-black/85" />
                <Input
                  aria-label="Password"
                  autoComplete="section-pbs current-password"
                  className="h-14 rounded-lg border-0 bg-white px-0 py-0 pl-[58px] pr-24 text-base leading-[26px] text-black/85 shadow-none placeholder:text-black/25 focus-visible:ring-2 focus-visible:ring-[#706cd5]/20 focus-visible:ring-offset-0"
                  name={PBS_PASSWORD_FIELD}
                  placeholder="Password"
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onBlur={() => {
                    if (!password) {
                      setPasswordError("Please enter your password.");
                    }
                  }}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) {
                      setPasswordError("");
                    }
                  }}
                />
                {password ? (
                  <button
                    className="absolute right-12 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-black/35 transition-colors hover:text-black/60"
                    type="button"
                    onClick={() => setPassword("")}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  className="absolute right-5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-black/35 transition-colors hover:text-black/60"
                  type="button"
                  onClick={() => setPasswordVisible((value) => !value)}
                >
                  {passwordVisible ? (
                    <EyeIcon className="h-4 w-4" />
                  ) : (
                    <EyeSlashIcon className="h-4 w-4" />
                  )}
                </button>
              </label>
              <p className="mt-1 min-h-4 px-1 text-xs leading-4 text-[#da6464]">
                {passwordError}
              </p>
            </div>

            <p className="min-h-5 px-1 pt-1 text-xs leading-5 text-[#da6464]">
              {submissionError}
            </p>

            <div className="space-y-2.5 pt-4">
              <Button
                className="h-14 w-full rounded-lg bg-[#706cd5] text-lg font-bold leading-[25px] text-white shadow-none hover:bg-[#615ec1]"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting && !token && !simulate ? "Signing In..." : "Sign In"}
              </Button>
              <Button
                className="h-14 w-full rounded-lg bg-[#706cd5] text-lg font-bold leading-[25px] text-white shadow-none hover:bg-[#615ec1]"
                disabled={isSubmitting}
                type="button"
                onClick={handleSsoSubmit}
              >
                SSO Login
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};
