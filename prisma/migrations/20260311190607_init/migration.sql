-- CreateTable
CREATE TABLE "Incident" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "altSources" TEXT,
    "date" TEXT,
    "parsedDate" TIMESTAMP(3),
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "headline" TEXT,
    "summary" TEXT,
    "incidentType" TEXT,
    "country" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RAW',
    "rawHtml" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Incident_url_key" ON "Incident"("url");
