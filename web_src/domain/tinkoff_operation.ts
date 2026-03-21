/**
 * Merges new operations into the existing list, updating existing ones
 * and maintaining chronological order.
 */
export function mergeTinkoffOperations(
  oldOperations: TinkoffOperation[],
  newOperations: TinkoffOperation[]
): void {
  // Map of actualId to index for O(1) lookups
  const oldIDs: Record<string, number> = {};
  oldOperations.forEach((op, index) => {
    oldIDs[getActualId(op)] = index;
  });

  // Filter and update existing operations
  const filteredNewOps = newOperations.filter((op) => {
    if (op.id === "0") return false;

    if (Object.prototype.hasOwnProperty.call(oldIDs, op.id)) {
      oldOperations[oldIDs[op.id]] = op;
      return false;
    }
    return true;
  });

  // Insert new unique operations (Sorting logic)
  let j = 0;
  for (let i = 0; i <= oldOperations.length && j < filteredNewOps.length; i++) {
    if (
      i === oldOperations.length ||
      filteredNewOps[j].operationTime.milliseconds >= oldOperations[i].operationTime.milliseconds
    ) {
      oldOperations.splice(i, 0, filteredNewOps[j]);
      j++;
    }
  }

  // Remove FAILED operations in-place
  for (let i = oldOperations.length - 1; i >= 0; i--) {
    if (oldOperations[i].status === "FAILED") {
      oldOperations.splice(i, 1);
    }
  }
}

// Helper to mimic Dart's getter
function getActualId(op: TinkoffOperation): string {
  return op.authorizationId ?? op.id;
}

export interface TinkoffOperation {
  id: string;
  status: string;
  description: string;
  mcc: number;
  operationTime: TinkoffDebitingTime;
  amount: TinkoffFeeAmount;
  accountAmount: TinkoffFeeAmount;
  cashbackAmount: TinkoffCashbackAmount;
  isOffline: boolean;
  hasStatement: boolean;
  isSuspicious: boolean;
  operationTransferred: boolean;
  idSourceType: string;

  // Optional Fields
  isDispute?: boolean;
  rubAmount?: TinkoffFeeAmount;
  operationPaymentType?: string;
  type?: string;
  trancheCreationAllowed?: boolean;
  subgroup?: TinkoffSubgroup;
  locations?: TinkoffLocations[];
  loyaltyBonus?: TinkoffLoyaltyBonus[];
  debitingTime?: TinkoffDebitingTime;
  cashback?: number;
  subcategory?: string;
  spendingCategory?: TinkoffSpendingCategory;
  isHce?: boolean;
  partnerType?: string;
  category?: TinkoffSubgroup;
  additionalInfo?: TinkoffAdditionalInfo[];
  virtualPaymentType?: number;
  account?: string;
  ucid?: string;
  merchant?: TinkoffMerchant;
  card?: string;
  group?: string;
  mccString?: string;
  cardPresent?: boolean;
  isExternalCard?: boolean;
  cardNumber?: string;
  authorizationId?: string;
  brand?: TinkoffBrand;
  senderDetails?: string;
  authMessage?: string;
  compensation?: string;
  hasShoppingReceipt?: boolean;
  senderAgreement?: string;
  message?: string;
  nomination?: string;
  payment?: TinkoffPayment;
}

export interface TinkoffPayment {
  sourceIsQr?: boolean;
  bankAccountId?: string;
  paymentId?: string;
  providerGroupId?: string;
  paymentType?: string;
  feeAmount?: TinkoffFeeAmount;
  providerId?: string;
  hasPaymentOrder?: boolean;
  comment?: string;
  fieldsValues?: Record<string, string>;
  repeatable?: boolean;
  cardNumber?: string;
  templateId?: string;
  templateIsFavorite?: boolean;
}

export interface TinkoffFeeAmount {
  currency: TinkoffCurrency;
  value: number;
}

export interface TinkoffCurrency {
  code: number;
  name: string;
  strCode: string;
}

export interface TinkoffSubgroup {
  id?: string;
  name?: string;
}

export interface TinkoffLocations {
  latitude?: number;
  longitude?: number;
}

export interface TinkoffLoyaltyBonus {
  loyaltyType?: string;
  amount?: TinkoffAmount;
  status?: string;
}

export interface TinkoffAmount {
  value?: number;
  loyaltyProgramId?: string;
  loyalty?: string;
  name?: string;
  loyaltySteps?: number;
  loyaltyPointsId?: number;
  loyaltyPointsName?: string;
  loyaltyImagine?: boolean;
  partialCompensation?: boolean;
}

export interface TinkoffCashbackAmount {
  currency: TinkoffCurrency;
  value: number;
}

export interface TinkoffDebitingTime {
  milliseconds: number;
}

export interface TinkoffSpendingCategory {
  id?: string;
  name?: string;
  icon?: string;
  parentId?: string;
}

export interface TinkoffAdditionalInfo {
  fieldName?: string;
  fieldValue?: string;
}

export interface TinkoffMerchant {
  name?: string;
  region?: TinkoffRegion;
}

export interface TinkoffRegion {
  country?: string;
  city?: string;
  address?: string;
  zip?: string;
  addressRus?: string;
}

export interface TinkoffBrand {
  name?: string;
  baseTextColor?: string;
  logo?: string;
  id?: string;
  roundedLogo?: boolean;
  link?: string;
  baseColor?: string;
  logoFile?: string;
}

export interface TinkoffDetails {
  hasNext?: boolean;
}