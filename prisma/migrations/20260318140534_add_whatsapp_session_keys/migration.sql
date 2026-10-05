-- CreateTable
CREATE TABLE "WhatsAppSessionKey" (
    "id" TEXT NOT NULL,
    "whatsappAuthId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "data" TEXT NOT NULL,

    CONSTRAINT "WhatsAppSessionKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppSessionKey_whatsappAuthId_idx" ON "WhatsAppSessionKey"("whatsappAuthId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSessionKey_whatsappAuthId_keyId_key" ON "WhatsAppSessionKey"("whatsappAuthId", "keyId");

-- AddForeignKey
ALTER TABLE "WhatsAppSessionKey" ADD CONSTRAINT "WhatsAppSessionKey_whatsappAuthId_fkey" FOREIGN KEY ("whatsappAuthId") REFERENCES "WhatsAppAuth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
