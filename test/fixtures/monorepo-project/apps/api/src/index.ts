import { createAuthService } from "@app/auth/service";
import { createBillingService } from "@app/billing/service";
import { createHostedService } from "@app/services/hosted";
import { CONTRACT_VERSION } from "@fixture/contracts";
import { contractLogger } from "@fixture/contracts/runtime/logger";

export const apiVersion = contractLogger(
  `${CONTRACT_VERSION}:${createAuthService()}:${createBillingService()}:${createHostedService()}`
);
