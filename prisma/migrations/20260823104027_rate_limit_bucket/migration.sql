-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "userId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("userId","windowStart")
);

-- AddForeignKey
ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
