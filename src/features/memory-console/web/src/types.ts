import type {
  ConsoleApiErrorResponse,
  ConsoleApiSuccessResponse,
  ConsoleGraphLoadResult,
  ConsoleLoadResult,
  ConsolePromoteActionInput,
  ConsolePurgeRejectedActionInput,
  ConsoleReviewActionInput,
  ConsoleReviewLoadResult,
  ConsoleRoute,
} from "../../types.js";

export type ConsolePath = ConsoleRoute;

export type ConsoleRouteData = ConsoleLoadResult | ConsoleReviewLoadResult | ConsoleGraphLoadResult;

export type ConsoleApiResponse = ConsoleApiSuccessResponse | ConsoleApiErrorResponse;

export type ConsoleMutationInput = ConsoleReviewActionInput | ConsolePromoteActionInput | ConsolePurgeRejectedActionInput;

export type ConsoleLoadState =
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly data: ConsoleRouteData }
  | { readonly status: "empty"; readonly data: ConsoleRouteData }
  | { readonly status: "error"; readonly message: string };
