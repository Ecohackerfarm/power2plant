CREATE INDEX "session_userId_idx" ON "session"("userId");
CREATE INDEX "account_userId_idx" ON "account"("userId");
CREATE INDEX "account_accountId_providerId_idx" ON "account"("accountId", "providerId");
