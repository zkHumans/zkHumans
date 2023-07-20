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
    "isTransforming" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "zkapp_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "storage" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "meta" JSONB,
    "isPending" BOOLEAN NOT NULL DEFAULT true,
    "commitmentPending" TEXT,
    "commitmentSettled" TEXT,
    "settlementChecksum" TEXT,
    "storageKey" TEXT,
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
    "transactionHash" TEXT NOT NULL,
    "blockHeight" BIGINT NOT NULL,
    "globalSlot" BIGINT NOT NULL,
    "zkappAddress" TEXT,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_event-storage" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_key_storageKey_key" ON "storage"("key", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "_event-storage_AB_unique" ON "_event-storage"("A", "B");

-- CreateIndex
CREATE INDEX "_event-storage_B_index" ON "_event-storage"("B");

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_storageKey_fkey" FOREIGN KEY ("storageKey") REFERENCES "storage"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_zkappAddress_fkey" FOREIGN KEY ("zkappAddress") REFERENCES "zkapp"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_zkappAddress_fkey" FOREIGN KEY ("zkappAddress") REFERENCES "zkapp"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_event-storage" ADD CONSTRAINT "_event-storage_A_fkey" FOREIGN KEY ("A") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_event-storage" ADD CONSTRAINT "_event-storage_B_fkey" FOREIGN KEY ("B") REFERENCES "storage"("key") ON DELETE CASCADE ON UPDATE CASCADE;
