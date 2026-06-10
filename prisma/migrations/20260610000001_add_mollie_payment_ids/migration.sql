-- Add Mollie payment ID to CreditTransaction (for Mollie credit top-ups)
ALTER TABLE "CreditTransaction" ADD COLUMN "molliePaymentId" TEXT;

-- Add Mollie payment ID to PotTransaction (for Mollie pot donations)
ALTER TABLE "PotTransaction" ADD COLUMN "molliePaymentId" TEXT;
ALTER TABLE "PotTransaction" ADD CONSTRAINT "PotTransaction_molliePaymentId_key" UNIQUE ("molliePaymentId");
