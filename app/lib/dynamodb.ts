import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { fetchAuthSession } from "aws-amplify/auth";
import { TABLES } from "./tables";
import { formatPlatformPrice } from "./pricing";

const REGION = "us-east-1";

export async function getClient(): Promise<DynamoDBDocumentClient> {
  const session = await fetchAuthSession();
  const credentials = session.credentials;

  if (!credentials) {
    throw new Error("No AWS credentials available. Is the user authenticated?");
  }

  const client = new DynamoDBClient({
    region: REGION,
    credentials,
  });

  return DynamoDBDocumentClient.from(client);
}

export type SharedLoan = {
  id: string;
  lender: string;
  purpose: string;
  totalAmount: string;
  remaining: string;
  monthlyPayment: string;
  rate: string;
  dueDate: string;
  status: string;
  notes: string;
};

export type SharedLoanInput = Omit<SharedLoan, "id">;

export async function fetchSharedLoans(): Promise<SharedLoan[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.sharedLoans })
  );
  return (result.Items || []) as SharedLoan[];
}

export async function createSharedLoan(loan: SharedLoanInput): Promise<SharedLoan> {
  const docClient = await getClient();
  const id = `loan-${Date.now()}`;
  const item: SharedLoan = { id, ...loan };

  await docClient.send(
    new PutCommand({ TableName: TABLES.sharedLoans, Item: item })
  );

  return item;
}

export async function updateSharedLoan(id: string, loan: SharedLoanInput): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.sharedLoans,
      Key: { id },
      UpdateExpression: "SET lender = :lender, purpose = :purpose, totalAmount = :totalAmount, remaining = :remaining, monthlyPayment = :monthlyPayment, rate = :rate, dueDate = :dueDate, #s = :status, notes = :notes",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":lender": loan.lender,
        ":purpose": loan.purpose,
        ":totalAmount": loan.totalAmount,
        ":remaining": loan.remaining,
        ":monthlyPayment": loan.monthlyPayment,
        ":rate": loan.rate,
        ":dueDate": loan.dueDate,
        ":status": loan.status,
        ":notes": loan.notes,
      },
    })
  );
}

export async function deleteSharedLoan(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.sharedLoans, Key: { id } })
  );
}

// --- Loan Charges ---

export type LoanCharge = {
  loanId: string;
  chargeId: string;
  date: string;
  amount: string;
  description: string;
  type: "payment" | "interest" | "fee" | "adjustment";
  receipt?: string;
};

export type LoanChargeInput = Omit<LoanCharge, "loanId" | "chargeId">;

export async function fetchLoanCharges(loanId: string): Promise<LoanCharge[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLES.loanCharges,
      KeyConditionExpression: "loanId = :loanId",
      ExpressionAttributeValues: { ":loanId": loanId },
      ScanIndexForward: false,
    })
  );
  return (result.Items || []) as LoanCharge[];
}

export async function createLoanCharge(loanId: string, charge: LoanChargeInput): Promise<LoanCharge> {
  const docClient = await getClient();
  const chargeId = `chg-${Date.now()}`;
  const item: LoanCharge = { loanId, chargeId, ...charge };

  await docClient.send(
    new PutCommand({ TableName: TABLES.loanCharges, Item: item })
  );

  return item;
}

export async function deleteLoanCharge(loanId: string, chargeId: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.loanCharges, Key: { loanId, chargeId } })
  );
}

// --- Investments ---

export type Investment = {
  id: string;
  date: string;
  investor: string;
  category: string;
  amount: string;
  returnEstimate: string;
};

export async function fetchInvestments(): Promise<Investment[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.investments })
  );
  return (result.Items || []) as Investment[];
}

// --- Menu Items ---

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: string;
  available: boolean;
  imageKey: string;
  notes: string;
  order: number;
  /** IDs of menu ingredients this item uses (see Menu Ingredients). */
  ingredientIds?: string[];
  /** Option groups offered when ordering this item (configured on Menu Items). */
  modifierGroups?: ModifierGroup[];
  /** Price on delivery platforms (Uber Eats): `price` + 30%. Derived on save; see lib/pricing.ts. */
  platformPrice?: string;
  /** ISO time of the last successful publish to Uber Eats; set by the menu sync API, not the form. */
  uberSyncedAt?: string;
  /** Fingerprint of what was sent at that publish (see uberFingerprint); compared to detect stale items. */
  uberSyncHash?: string;
};

/** A set of choosable options on a menu item (size, toppings, sides...). */
export type ModifierGroup = {
  id: string;
  name: string;
  type: "single" | "multi";
  required?: boolean;
  options: { id: string; name: string; price: number }[];
};

export type MenuItemInput = Omit<MenuItem, "id" | "uberSyncedAt" | "uberSyncHash">;

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.menuItems })
  );
  const items = (result.Items || []) as MenuItem[];
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function createMenuItem(item: MenuItemInput): Promise<MenuItem> {
  const docClient = await getClient();
  const id = `menu-${Date.now()}`;
  const record: MenuItem = { id, ...item, platformPrice: formatPlatformPrice(item.price) };

  await docClient.send(
    new PutCommand({ TableName: TABLES.menuItems, Item: record })
  );

  return record;
}

export async function updateMenuItem(id: string, item: MenuItemInput): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.menuItems,
      Key: { id },
      UpdateExpression: "SET #n = :name, description = :description, category = :category, price = :price, available = :available, imageKey = :imageKey, notes = :notes, #o = :order, ingredientIds = :ingredientIds, modifierGroups = :modifierGroups, platformPrice = :platformPrice",
      ExpressionAttributeNames: { "#n": "name", "#o": "order" },
      ExpressionAttributeValues: {
        ":name": item.name,
        ":description": item.description,
        ":category": item.category,
        ":price": item.price,
        ":available": item.available,
        ":imageKey": item.imageKey,
        ":notes": item.notes,
        ":order": item.order,
        ":ingredientIds": item.ingredientIds ?? [],
        ":modifierGroups": item.modifierGroups ?? [],
        // Always derived from the store price so the two can never drift apart.
        ":platformPrice": formatPlatformPrice(item.price),
      },
    })
  );
}

export async function updateMenuItemIngredients(id: string, ingredientIds: string[]): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.menuItems,
      Key: { id },
      UpdateExpression: "SET ingredientIds = :ingredientIds",
      ExpressionAttributeValues: { ":ingredientIds": ingredientIds },
    })
  );
}

export async function updateMenuItemImage(id: string, imageKey: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.menuItems,
      Key: { id },
      UpdateExpression: "SET imageKey = :imageKey",
      ExpressionAttributeValues: { ":imageKey": imageKey },
    })
  );
}

export async function deleteMenuItem(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.menuItems, Key: { id } })
  );
}

// --- Menu Ingredients ---

export type MenuIngredient = {
  id: string;
  name: string;
  category: string;
  available: boolean;
  notes: string;
};

export type MenuIngredientInput = Omit<MenuIngredient, "id">;

export async function fetchMenuIngredients(): Promise<MenuIngredient[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.menuIngredients })
  );
  const items = (result.Items || []) as MenuIngredient[];
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createMenuIngredient(item: MenuIngredientInput): Promise<MenuIngredient> {
  const docClient = await getClient();
  const id = `ingredient-${Date.now()}`;
  const record: MenuIngredient = { id, ...item };

  await docClient.send(
    new PutCommand({ TableName: TABLES.menuIngredients, Item: record })
  );

  return record;
}

export async function updateMenuIngredient(id: string, item: MenuIngredientInput): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.menuIngredients,
      Key: { id },
      UpdateExpression: "SET #n = :name, category = :category, available = :available, notes = :notes",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":name": item.name,
        ":category": item.category,
        ":available": item.available,
        ":notes": item.notes,
      },
    })
  );
}

export async function setMenuIngredientAvailability(id: string, available: boolean): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.menuIngredients,
      Key: { id },
      UpdateExpression: "SET available = :available",
      ExpressionAttributeValues: { ":available": available },
    })
  );
}

export async function deleteMenuIngredient(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.menuIngredients, Key: { id } })
  );
}

/** Ingredients used by an item that are currently out of stock (or deleted). */
export function getUnavailableIngredients(
  item: Pick<MenuItem, "ingredientIds">,
  ingredients: MenuIngredient[]
): MenuIngredient[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return (item.ingredientIds ?? [])
    .map((id) => byId.get(id))
    .filter((i): i is MenuIngredient => !!i && !i.available);
}

/** An item is orderable when it is marked available and all its ingredients are in stock. */
export function isMenuItemAvailable(
  item: Pick<MenuItem, "available" | "ingredientIds">,
  ingredients: MenuIngredient[]
): boolean {
  return item.available && getUnavailableIngredients(item, ingredients).length === 0;
}

// --- Ledger ---

export type LedgerEntry = {
  id: string;
  tipo: string;
  fecha: string;
  abono: string;
  cargo: string;
  descripcion: string;
  origen: string;
  destinoCLABE: string;
  destinoBeneficiario: string;
  notas: string;
};

export type LedgerEntryInput = Omit<LedgerEntry, "id">;

export async function fetchLedger(): Promise<LedgerEntry[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.ledger })
  );
  return (result.Items || []) as LedgerEntry[];
}

export async function createLedgerEntry(entry: LedgerEntryInput): Promise<LedgerEntry> {
  const docClient = await getClient();
  const id = `ldg-${Date.now()}`;
  const item: LedgerEntry = { id, ...entry };

  await docClient.send(
    new PutCommand({ TableName: TABLES.ledger, Item: item })
  );

  return item;
}

export async function updateLedgerEntry(id: string, entry: LedgerEntryInput): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.ledger,
      Key: { id },
      UpdateExpression: "SET tipo = :tipo, fecha = :fecha, abono = :abono, cargo = :cargo, descripcion = :descripcion, origen = :origen, destinoCLABE = :destinoCLABE, destinoBeneficiario = :destinoBeneficiario, notas = :notas",
      ExpressionAttributeValues: {
        ":tipo": entry.tipo,
        ":fecha": entry.fecha,
        ":abono": entry.abono,
        ":cargo": entry.cargo,
        ":descripcion": entry.descripcion,
        ":origen": entry.origen,
        ":destinoCLABE": entry.destinoCLABE,
        ":destinoBeneficiario": entry.destinoBeneficiario,
        ":notas": entry.notas,
      },
    })
  );
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.ledger, Key: { id } })
  );
}

// --- Orders (in-person checkout) ---

/** A chosen variant/modifier option on an order line (size, topping, side...). */
export type OrderModifier = {
  groupId: string;
  group: string;
  id: string;
  name: string;
  /** Price delta added to the unit price (can be 0). */
  price: number;
};

export type OrderLineItem = {
  menuItemId: string;
  name: string;
  /** Price of ONE unit including modifiers (what Checkout/Stripe charge). */
  unitPrice: number;
  quantity: number;
  // --- Order module (all optional so Checkout lines stay valid) ---
  lineId?: string;
  /** Menu price before modifiers. */
  basePrice?: number;
  modifiers?: OrderModifier[];
  /** Special instructions for the kitchen ("no onions", "allergy: nuts"). */
  instructions?: string;
  /** Seat number at the table this line belongs to. */
  seat?: number;
};

/** A line removed from an order with a reason; kept for audit, never charged. */
export type VoidedLine = OrderLineItem & { voidReason: string; voidedAt: string };

export type OrderStatus = "open" | "paid" | "cancelled" | "held";

export type ServiceType = "dine-in" | "takeout";

/** Where an order originated. Marketplace orders are already paid by Uber. */
export type OrderSource = "pos" | "uber-eats";
export type UberWorkflowStatus = "new" | "preparing" | "ready" | "completed";

export type PaymentMethod = "cash" | "card" | "transfer" | "other";

export type Order = {
  id: string;
  createdAt: string;
  tableLabel: string;
  server: string;
  items: OrderLineItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  // Estimated Stripe processing fee and net amount received (card payments
  // only; 0 for cash). The customer is never charged this — it's cost tracking.
  processingFee: number;
  netAmount: number;
  status: OrderStatus;
  /** Immutable lifecycle events used for service-time reporting. */
  statusHistory?: Array<{ status: string; at: string }>;
  /** Completion timestamp for dispatch workflows such as Uber Eats. */
  completedAt?: string;
  paymentMethod: PaymentMethod;
  notes: string;
  // Set by the Stripe webhook once a card payment succeeds. Absent for cash
  // and for card orders that haven't been paid yet.
  stripeSessionId?: string;
  stripePaymentIntentId?: string | null;
  paidAt?: string;
  // When a table's check is split by item, each resulting sub-check shares the
  // table's label (so the floor plan stays occupied until all are paid) and
  // carries a human label like "Guest 1".
  splitLabel?: string;
  // --- Order module ---
  serviceType?: ServiceType;
  source?: OrderSource;
  /** Marketplace order UUID, used to make webhook delivery idempotent. */
  uberOrderId?: string;
  uberDisplayId?: string;
  uberStoreId?: string;
  uberOrderState?: string;
  uberReadyForPickupAt?: string;
  /** Restaurant-facing dispatch state; marketplace payment does not close kitchen work. */
  uberWorkflowStatus?: UberWorkflowStatus;
  /** Default seat for new items (dine-in). */
  seat?: number;
  customerName?: string;
  /** Discount in pesos already applied to `total`. */
  discount?: number;
  discountType?: "percent" | "amount";
  discountValue?: number;
  /** Extra fee (packaging, service) in pesos, taxed, included in `total`. */
  fee?: number;
  feeLabel?: string;
  voidedItems?: VoidedLine[];
  cancelReason?: string;
  heldAt?: string;
  /** S3 key of the bank-transfer proof (screenshot sent by the customer), for transfer payments. */
  transferEvidenceKey?: string;
  /** Set when the kitchen finished cooking an open order ("Ready" tab). Status stays "open" so checkout/payment flows are unaffected. */
  readyAt?: string;
  mergedInto?: string;
  mergedFrom?: string[];
  splitFrom?: string;
  // --- Sale ticket ---
  /** Human-friendly sale code printed on the ticket, e.g. "CRL-20261108-007". Assigned when the order is first saved. */
  saleCode?: string;
  /** Who charged the sale (the signed-in user at payment time). */
  cashier?: string;
  /** Currency the customer paid in. All order amounts stay in MXN; this only affects the ticket. Default "MXN". */
  currency?: Currency;
  /** MXN per 1 USD at the time of payment (set when currency is USD). */
  exchangeRate?: number;
  /** Cash handed over by the customer, in `currency`. */
  amountTendered?: number;
  /** Change returned to the customer, in `currency`. */
  change?: number;
};

export type Currency = "MXN" | "USD";

// --- Order metadata (counters, settings) ---
// Stored in the orders table next to the orders; filtered out of order lists.

/** Id prefix for non-order records (sale-code counters, exchange rate) in the orders table. */
export const META_ID_PREFIX = "meta-";

const EXCHANGE_RATE_ID = `${META_ID_PREFIX}exchange-rate`;

/**
 * Next sale code, e.g. "CRL-20261108-007": a per-day sequence kept by an atomic
 * DynamoDB counter, so two tablets can never get the same code. Returns
 * undefined if the counter fails (the order must still be saved).
 */
export async function nextSaleCode(now: Date = new Date()): Promise<string | undefined> {
  try {
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const docClient = await getClient();
    const res = await docClient.send(
      new UpdateCommand({
        TableName: TABLES.orders,
        Key: { id: `${META_ID_PREFIX}sale-seq-${day}` },
        UpdateExpression: "ADD seq :one",
        ExpressionAttributeValues: { ":one": 1 },
        ReturnValues: "UPDATED_NEW",
      })
    );
    const seq = Number(res.Attributes?.seq ?? 0);
    return `CRL-${day}-${String(seq).padStart(3, "0")}`;
  } catch (err) {
    console.error("Failed to generate sale code:", err);
    return undefined;
  }
}

export type ExchangeRate = { rate: number; updatedAt: string; updatedBy: string };

/** Current MXN-per-USD rate, shared by every device. Null until it is first set. */
export async function getExchangeRate(): Promise<ExchangeRate | null> {
  const docClient = await getClient();
  const res = await docClient.send(
    new GetCommand({ TableName: TABLES.orders, Key: { id: EXCHANGE_RATE_ID } })
  );
  const item = res.Item as (ExchangeRate & { id: string }) | undefined;
  return item && item.rate > 0 ? { rate: item.rate, updatedAt: item.updatedAt, updatedBy: item.updatedBy } : null;
}

export async function setExchangeRate(rate: number, updatedBy: string): Promise<ExchangeRate> {
  const record = { rate, updatedAt: new Date().toISOString(), updatedBy };
  const docClient = await getClient();
  await docClient.send(
    new PutCommand({ TableName: TABLES.orders, Item: { id: EXCHANGE_RATE_ID, ...record } })
  );
  return record;
}

export type OrderInput = Omit<Order, "id" | "createdAt">;

export async function fetchOrders(): Promise<Order[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.orders })
  );
  const items = ((result.Items || []) as Order[]).filter(
    // Cash reconciliations and metadata (counters, settings) share this table; they are not orders.
    (o) => !String(o.id).startsWith(CORTE_ID_PREFIX) && !String(o.id).startsWith(META_ID_PREFIX)
  );
  return items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

// --- Cash reconciliation (Corte de Caja) ---

/** Id prefix that distinguishes reconciliation records from orders. */
export const CORTE_ID_PREFIX = "corte-";

/** An attached file (e.g. a purchase receipt) stored in S3. */
export type CashEvidence = {
  key: string;
  name: string;
  contentType: string;
};

/** A saved end-of-day cash reconciliation, kept for manager review. */
export type CashReconciliation = {
  id: string;
  createdAt: string;
  createdBy: string;
  openingFloat: number;
  cashSales: number;
  cashTips: number;
  expectedCash: number;
  countedCash: number;
  /** counted − expected: positive = over, negative = short. */
  difference: number;
  cashOrderCount: number;
  cardCount: number;
  cardTotal: number;
  cardFees: number;
  transferCount: number;
  transferTotal: number;
  bankTotal: number;
  comments: string;
  /** Receipts / proof explaining differences (S3 keys). */
  evidence?: CashEvidence[];
  /** Set when another manager marks the corte as reviewed. */
  reviewedBy?: string;
  reviewedAt?: string;
};

export type CashReconciliationInput = Omit<
  CashReconciliation,
  "id" | "createdAt" | "reviewedBy" | "reviewedAt"
>;

/** Persist a reconciliation. Returns the saved record. */
export async function saveCashReconciliation(
  input: CashReconciliationInput
): Promise<CashReconciliation> {
  const docClient = await getClient();
  const record: CashReconciliation = {
    id: `${CORTE_ID_PREFIX}${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await docClient.send(
    new PutCommand({ TableName: TABLES.orders, Item: record })
  );
  return record;
}

/** All saved reconciliations, newest first. */
export async function fetchCashReconciliations(): Promise<CashReconciliation[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.orders,
      FilterExpression: "begins_with(id, :p)",
      ExpressionAttributeValues: { ":p": CORTE_ID_PREFIX },
    })
  );
  const items = (result.Items || []) as CashReconciliation[];
  return items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Record that a manager reviewed a reconciliation. */
export async function markCashReconciliationReviewed(
  id: string,
  reviewer: string
): Promise<string> {
  const docClient = await getClient();
  const reviewedAt = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      ConditionExpression: "attribute_exists(id)",
      UpdateExpression: "SET reviewedBy = :r, reviewedAt = :t",
      ExpressionAttributeValues: { ":r": reviewer, ":t": reviewedAt },
    })
  );
  return reviewedAt;
}

/** Read a single order by id — used to poll for card-payment confirmation. */
export async function getOrder(id: string): Promise<Order | null> {
  const docClient = await getClient();
  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.orders, Key: { id } })
  );
  return (result.Item as Order | undefined) ?? null;
}

/**
 * Fetch all open checks (orders with status "open"), newest first. Used by the
 * checkout floor plan to know which tables are occupied and to load a table's
 * in-progress cart.
 */
export async function fetchOpenChecks(): Promise<Order[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.orders,
      FilterExpression: "#s = :open",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":open": "open" as OrderStatus },
    })
  );
  const items = (result.Items || []) as Order[];
  return items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** The cart + running totals persisted on an open check. */
export type OpenCheckInput = {
  tableLabel: string;
  server: string;
  items: OrderLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes: string;
};

/**
 * Create or update the open check for a table so an in-progress cart survives
 * page refreshes and is shared across devices. If `id` is provided the existing
 * check is updated; otherwise a new open order is created. Tip/payment method
 * are left at their defaults until payout. Returns the order id.
 */
export async function saveOpenCheck(
  id: string | null,
  check: OpenCheckInput
): Promise<string> {
  const docClient = await getClient();

  if (id) {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.orders,
        Key: { id },
        // Only touch checks that are still open — never a paid/cancelled one.
        ConditionExpression: "attribute_exists(id) AND #s = :open",
        UpdateExpression:
          "SET tableLabel = :tableLabel, #srv = :server, #itms = :items, " +
          "subtotal = :subtotal, tax = :tax, #tot = :total, notes = :notes",
        ExpressionAttributeNames: {
          "#s": "status",
          "#srv": "server",
          "#itms": "items",
          "#tot": "total",
        },
        ExpressionAttributeValues: {
          ":open": "open" as OrderStatus,
          ":tableLabel": check.tableLabel,
          ":server": check.server,
          ":items": check.items,
          ":subtotal": check.subtotal,
          ":tax": check.tax,
          ":total": check.total,
          ":notes": check.notes,
        },
      })
    );
    return id;
  }

  const newId = `ord-${Date.now()}`;
  const record: Order = {
    id: newId,
    saleCode: await nextSaleCode(),
    createdAt: new Date().toISOString(),
    tableLabel: check.tableLabel,
    server: check.server,
    items: check.items,
    subtotal: check.subtotal,
    tax: check.tax,
    tip: 0,
    total: check.total,
    processingFee: 0,
    netAmount: 0,
    status: "open",
    paymentMethod: "cash",
    notes: check.notes,
  };
  await docClient.send(
    new PutCommand({ TableName: TABLES.orders, Item: record })
  );
  return newId;
}

/**
 * Persist the final tip/total on an open check without closing it. Used for the
 * card path, where the order must stay "open" for the Stripe webhook to flip it
 * to "paid" — but we still want the chosen tip recorded on the order.
 */
export async function setOpenCheckTip(
  id: string,
  tip: number,
  total: number
): Promise<void> {
  const docClient = await getClient();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      ConditionExpression: "attribute_exists(id) AND #s = :open",
      UpdateExpression: "SET tip = :tip, #tot = :total, paymentMethod = :pm",
      ExpressionAttributeNames: { "#s": "status", "#tot": "total" },
      ExpressionAttributeValues: {
        ":open": "open" as OrderStatus,
        ":tip": tip,
        ":total": total,
        ":pm": "card" as PaymentMethod,
      },
    })
  );
}

/**
 * Pay out (close) an open check. Sets the final tip/total/payment method and
 * flips status to "paid", which frees the table. For card payments the status
 * stays "open" here and the Stripe webhook flips it — use saveOpenCheck +
 * the checkout API for that path instead.
 */
export async function closeCheckPaid(
  id: string,
  finalize: {
    tip: number;
    total: number;
    paymentMethod: PaymentMethod;
    /** S3 key of the transfer proof image, when one was attached. */
    transferEvidenceKey?: string;
    /** Sale-ticket details (see Order). */
    cashier?: string;
    currency?: Currency;
    exchangeRate?: number;
    amountTendered?: number;
    change?: number;
    /** In-person Stripe payment (Tap to Pay) matched to this check, with its real fee/net. */
    stripePaymentIntentId?: string;
    processingFee?: number;
    netAmount?: number;
  }
): Promise<{ paidAt: string }> {
  const docClient = await getClient();
  const paidAt = new Date().toISOString();
  const extras: Record<string, unknown> = {
    transferEvidenceKey: finalize.transferEvidenceKey,
    cashier: finalize.cashier,
    currency: finalize.currency,
    exchangeRate: finalize.exchangeRate,
    amountTendered: finalize.amountTendered,
    change: finalize.change,
    stripePaymentIntentId: finalize.stripePaymentIntentId,
    processingFee: finalize.processingFee,
  };
  // Only write the optional fields that have a value.
  const names: Record<string, string> = { "#s": "status", "#tot": "total" };
  const values: Record<string, unknown> = {
    ":open": "open" as OrderStatus,
    ":paid": "paid" as OrderStatus,
    ":tip": finalize.tip,
    ":total": finalize.total,
    ":net": finalize.netAmount ?? finalize.total,
    ":pm": finalize.paymentMethod,
    ":paidAt": paidAt,
    ":emptyHistory": [],
    ":paidHistory": [{ status: "paid", at: paidAt }],
  };
  let extraSet = "";
  for (const [key, value] of Object.entries(extras)) {
    if (value === undefined) continue;
    names[`#x_${key}`] = key;
    values[`:x_${key}`] = value;
    extraSet += `, #x_${key} = :x_${key}`;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      ConditionExpression: "attribute_exists(id) AND #s = :open",
      UpdateExpression:
        "SET #s = :paid, tip = :tip, #tot = :total, paymentMethod = :pm, " +
        "netAmount = :net, paidAt = :paidAt, statusHistory = list_append(if_not_exists(statusHistory, :emptyHistory), :paidHistory)" +
        extraSet,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
  return { paidAt };
}

export async function createOrder(order: OrderInput): Promise<Order> {
  const docClient = await getClient();
  const id = `ord-${Date.now()}`;
  const record: Order = {
    id,
    createdAt: new Date().toISOString(),
    ...order,
    saleCode: order.saleCode ?? (await nextSaleCode()),
  };

  await docClient.send(
    new PutCommand({ TableName: TABLES.orders, Item: record })
  );

  return record;
}

/** One sub-check produced by splitting a table's check by item. */
export type SplitBucket = {
  label: string; // e.g. "Guest 1"
  items: OrderLineItem[];
  subtotal: number;
  tax: number;
  total: number;
};

/**
 * Undo a split: merge all OPEN checks for a table back into a single open
 * check (summing their items by menu item), then delete the rest. Only touches
 * open checks, so any already-paid sub-check is left alone. Returns the merged
 * check, or null if the table has no open checks.
 *
 * `taxRate` is applied to the merged subtotal so the single check's tax/total
 * are consistent.
 */
export async function unsplitCheck(
  tableLabel: string,
  server: string,
  taxRate: number
): Promise<Order | null> {
  const docClient = await getClient();
  const open = (await fetchOpenChecks()).filter(
    (o) => o.tableLabel === tableLabel
  );
  if (open.length === 0) return null;

  // Merge all items by menuItemId.
  const byItem = new Map<string, OrderLineItem>();
  for (const check of open) {
    for (const line of check.items) {
      const existing = byItem.get(line.menuItemId);
      if (existing) existing.quantity += line.quantity;
      else byItem.set(line.menuItemId, { ...line });
    }
  }
  const items = Array.from(byItem.values());
  const subtotal =
    Math.round(items.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) /
    100;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  // Keep the earliest check as the merged one; delete the others.
  const sorted = [...open].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
  const keep = sorted[0];
  // Build the merged record WITHOUT a splitLabel key (the document client
  // rejects undefined values), so it becomes a normal single check again.
  const merged: Order = {
    id: keep.id,
    createdAt: keep.createdAt,
    tableLabel,
    server,
    items,
    subtotal,
    tax,
    tip: 0,
    total,
    processingFee: 0,
    netAmount: 0,
    status: "open",
    paymentMethod: "cash",
    notes: keep.notes ?? "",
  };

  await docClient.send(
    new PutCommand({ TableName: TABLES.orders, Item: merged })
  );
  for (const check of sorted.slice(1)) {
    await docClient.send(
      new DeleteCommand({ TableName: TABLES.orders, Key: { id: check.id } })
    );
  }

  return merged;
}

/**
 * Split one open check into several open sub-checks, one per bucket. Each
 * sub-check keeps the table's label (so the floor plan stays occupied until
 * every sub-check is paid) and gets a `splitLabel`. The original check is
 * deleted. Buckets with no items are skipped. Returns the created sub-checks.
 *
 * Only proceeds if the original is still "open" (not already paid/split-away).
 */
export async function splitCheckByItem(
  originalId: string,
  tableLabel: string,
  server: string,
  buckets: SplitBucket[]
): Promise<Order[]> {
  const docClient = await getClient();

  // Guard: make sure the original still exists and is open.
  const existing = await getOrder(originalId);
  if (!existing || existing.status !== "open") {
    throw new Error("Check is no longer open; cannot split.");
  }

  const nonEmpty = buckets.filter((b) => b.items.length > 0);
  if (nonEmpty.length < 2) {
    throw new Error("A split needs at least two non-empty sub-checks.");
  }

  const now = Date.now();
  const created: Order[] = nonEmpty.map((b, i) => ({
    id: `${originalId}-s${i + 1}-${now}`,
    createdAt: new Date().toISOString(),
    tableLabel,
    server,
    items: b.items,
    subtotal: b.subtotal,
    tax: b.tax,
    tip: 0,
    total: b.total,
    processingFee: 0,
    netAmount: 0,
    status: "open",
    paymentMethod: "cash",
    notes: "",
    splitLabel: b.label,
  }));

  // Write all sub-checks, then remove the original.
  for (const sub of created) {
    await docClient.send(
      new PutCommand({ TableName: TABLES.orders, Item: sub })
    );
  }
  await docClient.send(
    new DeleteCommand({ TableName: TABLES.orders, Key: { id: originalId } })
  );

  return created;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  paymentMethod: PaymentMethod
): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      UpdateExpression: "SET #s = :status, paymentMethod = :paymentMethod",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":paymentMethod": paymentMethod,
      },
    })
  );
}

export async function deleteOrder(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.orders, Key: { id } })
  );
}

// --- Reservations ---

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no-show";

export type Reservation = {
  id: string;
  createdAt: string;
  guestName: string;
  phone: string;
  partySize: number;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:mm (24h). */
  time: string;
  /** Table label, matching the checkout floor plan. Empty if unassigned. */
  tableLabel: string;
  status: ReservationStatus;
  notes: string;
};

export type ReservationInput = Omit<Reservation, "id" | "createdAt">;

/** All reservations, soonest first. */
export async function fetchReservations(): Promise<Reservation[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.reservations })
  );
  const items = (result.Items || []) as Reservation[];
  return items.sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );
}

export async function createReservation(input: ReservationInput): Promise<Reservation> {
  const docClient = await getClient();
  const record: Reservation = {
    id: `res-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };

  await docClient.send(
    new PutCommand({ TableName: TABLES.reservations, Item: record })
  );

  return record;
}

export async function updateReservation(id: string, input: ReservationInput): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.reservations,
      Key: { id },
      ConditionExpression: "attribute_exists(id)",
      UpdateExpression:
        "SET guestName = :guestName, phone = :phone, partySize = :partySize, #d = :date, #t = :time, tableLabel = :tableLabel, #s = :status, notes = :notes",
      ExpressionAttributeNames: { "#d": "date", "#t": "time", "#s": "status" },
      ExpressionAttributeValues: {
        ":guestName": input.guestName,
        ":phone": input.phone,
        ":partySize": input.partySize,
        ":date": input.date,
        ":time": input.time,
        ":tableLabel": input.tableLabel,
        ":status": input.status,
        ":notes": input.notes,
      },
    })
  );
}

export async function setReservationStatus(id: string, status: ReservationStatus): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.reservations,
      Key: { id },
      ConditionExpression: "attribute_exists(id)",
      UpdateExpression: "SET #s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": status },
    })
  );
}

export async function deleteReservation(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.reservations, Key: { id } })
  );
}

// --- Employees & weekly payroll receipts ---

export type EmployeeDocumentType =
  | "actaNacimiento"
  | "cedulaProfesional"
  | "certificadoEstudios"
  | "comprobanteDomicilio"
  | "constanciaRegistroPoblacion"
  | "constanciaSituacionFiscal"
  | "contactosEmergencia"
  | "cuentaBanco"
  | "ine"
  | "manifestacionActividadAdicional"
  | "numeroSeguroSocial"
  | "solicitudEmpleo";

/** A file attached to an employee, stored in S3. */
export type EmployeeDocument = {
  key: string;
  name: string;
  contentType: string;
  type: EmployeeDocumentType;
  uploadedAt: string;
};

export type EmployeePayMethod = "cash" | "transfer";

/** Payment method printed on a receipt ("other" has a free-text description). */
export type ReceiptPayMethod = EmployeePayMethod | "other";

export type EmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type Employee = {
  id: string;
  createdAt: string;
  fullName: string;
  position: string;
  phone: string;
  address: string;
  emergencyContacts: EmergencyContact[];
  /** Mexican tax / social-security identifiers. */
  curp: string;
  rfc: string;
  nss: string;
  /** Hire date, YYYY-MM-DD. */
  hireDate: string;
  /** Fixed weekly salary in MXN. */
  weeklySalary: number;
  paymentMethod: EmployeePayMethod;
  /** Bank account (CLABE) for transfer payments. */
  clabe: string;
  active: boolean;
  notes: string;
  documents: EmployeeDocument[];
};

export type EmployeeInput = Omit<Employee, "id" | "createdAt">;

export async function fetchEmployees(): Promise<Employee[]> {
  const docClient = await getClient();
  const result = await docClient.send(new ScanCommand({ TableName: TABLES.employees }));
  const items = ((result.Items || []) as (Employee & { emergencyContact?: string })[]).map((e) => {
    // Records saved before multiple contacts existed hold a single free-text string.
    const { emergencyContact: legacy, ...rest } = e;
    const contacts = e.emergencyContacts ?? (legacy?.trim() ? [{ name: legacy.trim(), relationship: "", phone: "" }] : []);
    return { ...rest, emergencyContacts: contacts, documents: e.documents ?? [] } as Employee;
  });
  return items.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const docClient = await getClient();
  const record: Employee = {
    id: `emp-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...input,
  };
  await docClient.send(new PutCommand({ TableName: TABLES.employees, Item: record }));
  return record;
}

export async function updateEmployee(employee: Employee): Promise<void> {
  const docClient = await getClient();
  await docClient.send(
    new PutCommand({
      TableName: TABLES.employees,
      Item: employee,
      ConditionExpression: "attribute_exists(id)",
    })
  );
}

export async function deleteEmployee(id: string): Promise<void> {
  const docClient = await getClient();
  await docClient.send(new DeleteCommand({ TableName: TABLES.employees, Key: { id } }));
}

/**
 * One weekly pay receipt. Employee details are copied (snapshot) so reprinting
 * an old receipt is unaffected by later salary or position changes.
 */
export type PayrollReceipt = {
  id: string;
  employeeId: string;
  /** Week end (always a Saturday), YYYY-MM-DD. */
  weekEnd: string;
  /** Week start (the Sunday before), YYYY-MM-DD. */
  weekStart: string;
  folio: string;
  employeeName: string;
  position: string;
  curp: string;
  rfc: string;
  nss: string;
  paymentMethod: ReceiptPayMethod;
  /** Description when `paymentMethod` is "other". */
  paymentMethodOther?: string;
  weeklySalary: number;
  daysWorked: number;
  /** "Días de descanso pagados". */
  restDaysPaid?: number;
  /** "Otros pagos": bonuses and other extra payments added to the salary. */
  otherPay: number;
  /** Required whenever `otherPay` > 0. */
  otherPayNote: string;
  /** "Descuentos": advances, absences, loans... subtracted from the pay. */
  deductions: number;
  /** Required whenever `deductions` > 0. */
  deductionsNote: string;
  net: number;
  printedAt?: string;
  updatedAt: string;
};

export type PayrollReceiptInput = Omit<PayrollReceipt, "id" | "updatedAt" | "printedAt">;

export function payrollReceiptId(employeeId: string, weekEnd: string): string {
  return `pay-${weekEnd}-${employeeId}`;
}

export async function getPayrollReceipt(employeeId: string, weekEnd: string): Promise<PayrollReceipt | null> {
  const docClient = await getClient();
  const result = await docClient.send(
    new GetCommand({ TableName: TABLES.payrollReceipts, Key: { id: payrollReceiptId(employeeId, weekEnd) } })
  );
  return (result.Item as PayrollReceipt | undefined) ?? null;
}

export async function fetchPayrollReceipts(weekEnd: string): Promise<PayrollReceipt[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({
      TableName: TABLES.payrollReceipts,
      FilterExpression: "weekEnd = :w",
      ExpressionAttributeValues: { ":w": weekEnd },
    })
  );
  return (result.Items || []) as PayrollReceipt[];
}

/** Create or overwrite the receipt for an employee + week (one per pair). */
export async function savePayrollReceipt(
  input: PayrollReceiptInput,
  printedAt?: string
): Promise<PayrollReceipt> {
  const docClient = await getClient();
  const record: PayrollReceipt = {
    ...input,
    id: payrollReceiptId(input.employeeId, input.weekEnd),
    updatedAt: new Date().toISOString(),
    ...(printedAt ? { printedAt } : {}),
  };
  await docClient.send(new PutCommand({ TableName: TABLES.payrollReceipts, Item: record }));
  return record;
}

export async function markPayrollReceiptsPrinted(ids: string[]): Promise<void> {
  const docClient = await getClient();
  const printedAt = new Date().toISOString();
  await Promise.all(
    ids.map((id) =>
      docClient.send(
        new UpdateCommand({
          TableName: TABLES.payrollReceipts,
          Key: { id },
          ConditionExpression: "attribute_exists(id)",
          UpdateExpression: "SET printedAt = :p",
          ExpressionAttributeValues: { ":p": printedAt },
        })
      )
    )
  );
}
