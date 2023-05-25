-- CreateTable
CREATE TABLE "log" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smt" (
    "id" TEXT NOT NULL,
    "root" TEXT NOT NULL,

    CONSTRAINT "smt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtTxn" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "txn" TEXT NOT NULL,
    "smtId" TEXT,

    CONSTRAINT "smtTxn_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "smtTxn" ADD CONSTRAINT "smtTxn_smtId_fkey" FOREIGN KEY ("smtId") REFERENCES "smt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
