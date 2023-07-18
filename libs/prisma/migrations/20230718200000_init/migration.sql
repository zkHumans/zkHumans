-- CreateTable
CREATE TABLE "log" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zkapp" (
    "address" TEXT NOT NULL,
    "blockInit" BIGINT NOT NULL DEFAULT 0,
    "blockLast" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zkapp_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "storage" (
    "key" TEXT NOT NULL,
    "value" TEXT,
    "meta" JSONB,
    "isPending" BOOLEAN NOT NULL DEFAULT true,
    "commitmentPending" TEXT,
    "commitmentSettled" TEXT,
    "settlementChecksum" TEXT,
    "storageKey" TEXT,
    "eventId" TEXT NOT NULL,
    "zkappAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "transactionInfo" JSONB NOT NULL,
    "blockHeight" BIGINT NOT NULL,
    "globalSlot" BIGINT NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_key_storageKey_key" ON "storage"("key", "storageKey");

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_storageKey_fkey" FOREIGN KEY ("storageKey") REFERENCES "storage"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_zkappAddress_fkey" FOREIGN KEY ("zkappAddress") REFERENCES "zkapp"("address") ON DELETE CASCADE ON UPDATE CASCADE;
