const RULE_BID_SAVE_ERROR_FALLBACK = "Unable to save this draft. Please review the highlighted issues and try again.";

type ResponseLikeError = {
  response?: {
    status?: unknown;
    data?: {
      message?: unknown;
    };
  };
};

export const isRuleBidDraftConflictError = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }

  return (error as ResponseLikeError).response?.status === 409;
};

export const isRuleBidMissingFavoriteError = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return false;
  }

  return (error as ResponseLikeError).response?.status === 404;
};

export const getRuleBidSaveErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const responseError = error as ResponseLikeError;
    const message = responseError.response?.data?.message;

    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return RULE_BID_SAVE_ERROR_FALLBACK;
};
