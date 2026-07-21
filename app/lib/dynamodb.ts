import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { fetchAuthSession } from "aws-amplify/auth";

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
    new ScanCommand({ TableName: "coral-shared-loans" })
  );
  return (result.Items || []) as SharedLoan[];
}

export async function createSharedLoan(loan: SharedLoanInput): Promise<SharedLoan> {
  const docClient = await getClient();
  const id = `loan-${Date.now()}`;
  const item: SharedLoan = { id, ...loan };

  await docClient.send(
    new PutCommand({ TableName: "coral-shared-loans", Item: item })
  );

  return item;
}

export async function updateSharedLoan(id: string, loan: SharedLoanInput): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new UpdateCommand({
      TableName: "coral-shared-loans",
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
    new DeleteCommand({ TableName: "coral-shared-loans", Key: { id } })
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
      TableName: "coral-loan-charges",
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
    new PutCommand({ TableName: "coral-loan-charges", Item: item })
  );

  return item;
}

export async function deleteLoanCharge(loanId: string, chargeId: string): Promise<void> {
  const docClient = await getClient();

  await docClient.send(
    new DeleteCommand({ TableName: "coral-loan-charges", Key: { loanId, chargeId } })
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
    new ScanCommand({ TableName: "coral-investments" })
  );
  return (result.Items || []) as Investment[];
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

export async function fetchLedger(): Promise<LedgerEntry[]> {
  const docClient = await getClient();
  const result = await docClient.send(
    new ScanCommand({ TableName: "coral-ledger" })
  );
  return (result.Items || []) as LedgerEntry[];
}
