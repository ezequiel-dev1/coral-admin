import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { fetchAuthSession } from "aws-amplify/auth";
import { TABLES } from "./tables";

const REGION = "us-east-1";

async function getClient(): Promise<DynamoDBDocumentClient> {
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
};

export type MenuItemInput = Omit<MenuItem, "id">;

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
  const record: MenuItem = { id, ...item };

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
      UpdateExpression: "SET #n = :name, description = :description, category = :category, price = :price, available = :available, imageKey = :imageKey, notes = :notes, #o = :order",
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
      },
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

export async function deleteMenuIngredient(id: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: TABLES.menuIngredients, Key: { id } })
  );
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

export type OrderLineItem = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

export type OrderStatus = "open" | "paid" | "cancelled";

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
};

export type OrderInput = Omit<Order, "id" | "createdAt">;

export async function fetchOrders(): Promise<Order[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: TABLES.orders })
  );
  const items = (result.Items || []) as Order[];
  return items.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
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
  }
): Promise<void> {
  const docClient = await getClient();
  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.orders,
      Key: { id },
      ConditionExpression: "attribute_exists(id) AND #s = :open",
      UpdateExpression:
        "SET #s = :paid, tip = :tip, #tot = :total, paymentMethod = :pm, " +
        "netAmount = :total, paidAt = :paidAt",
      ExpressionAttributeNames: { "#s": "status", "#tot": "total" },
      ExpressionAttributeValues: {
        ":open": "open" as OrderStatus,
        ":paid": "paid" as OrderStatus,
        ":tip": finalize.tip,
        ":total": finalize.total,
        ":pm": finalize.paymentMethod,
        ":paidAt": new Date().toISOString(),
      },
    })
  );
}

export async function createOrder(order: OrderInput): Promise<Order> {
  const docClient = await getClient();
  const id = `ord-${Date.now()}`;
  const record: Order = { id, createdAt: new Date().toISOString(), ...order };

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
