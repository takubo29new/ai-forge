-- RateLimitBucketは1時間ウィンドウの一時的なカウンタで、失っても実害の
-- ない揮発データのため、主キー変更にあたりTRUNCATEしてから列を追加する。
TRUNCATE TABLE "RateLimitBucket";

ALTER TABLE "RateLimitBucket" DROP CONSTRAINT "RateLimitBucket_pkey";

ALTER TABLE "RateLimitBucket" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'execution';

ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("userId", "windowStart", "purpose");
