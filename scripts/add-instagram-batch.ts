/**
 * Add a batch of Instagram URLs to the database and process them.
 * Usage: npx tsx scripts/add-instagram-batch.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

import { prisma } from "../src/lib/db";
import { processInstagramPipeline } from "../src/lib/instagram-pipeline";

const URLS = `
https://www.instagram.com/p/DTfSBJNEuKx/
https://www.instagram.com/p/DTgrOXnj6uC/
https://www.instagram.com/p/DTfqjLlFl2j/
https://www.instagram.com/p/DTfDzw1ErX_/
https://www.instagram.com/p/DThJUC1kmSw/
https://www.instagram.com/p/DTfkF2bjYqV/
https://www.instagram.com/p/DTfddAwEryw/
https://www.instagram.com/p/DTen_BoCMmP/
https://www.instagram.com/p/DTd6ujfAWDV/
https://www.instagram.com/p/DTdcBSLiezR/
https://www.instagram.com/p/DTdtisVkqxy/
https://www.instagram.com/p/DTeCeiOEwV6/
https://www.instagram.com/p/DTd2S-DlCLz/
https://www.instagram.com/p/DTa4yzXlSMI/
https://www.instagram.com/p/DTRHGI0E3xk/
https://www.instagram.com/p/DTbHDgtkvAD/
https://www.instagram.com/p/DTbubTvgFBi/
https://www.instagram.com/p/DTamZQajt5s/
https://www.instagram.com/p/DTbUkbrEc-t/
https://www.instagram.com/p/DTYWntLjQgS/
https://www.instagram.com/p/DTbMZPYkaf6/
https://www.instagram.com/p/DTYMe3Gj5kn/
https://www.instagram.com/p/DTV5t88EuRP/
https://www.instagram.com/p/DTVWXu4DR0Q/
https://www.instagram.com/p/DTYttd-Eohk/
https://www.instagram.com/p/DTW3r5HjJia/
https://www.instagram.com/p/DTXtzwmgJbC/
https://www.instagram.com/p/DTWq2MElMAF/
https://www.instagram.com/p/DTRgW58DtQf/
https://www.instagram.com/p/DTTcvtiEpIX/
https://www.instagram.com/p/DTTb28gkTiV/
https://www.instagram.com/p/DTTiMJhEtBl/
https://www.instagram.com/p/DTS45N_Ebv4/
https://www.instagram.com/p/DSx-csMDn6A/
https://www.instagram.com/p/DTRjsDzjY6N/
https://www.instagram.com/p/DTRayUxCX91/
https://www.instagram.com/p/DS3DHsGkwV0/
https://www.instagram.com/p/DTTPKpijlbo/
https://www.instagram.com/p/DTQ_IFmAaFa/
https://www.instagram.com/p/DTRmXAaDY7N/
https://www.instagram.com/p/DTRUe2Aip-4/
https://www.instagram.com/p/DTOZH3ME7N8/
https://www.instagram.com/p/DTQThAWkXW-/
https://www.instagram.com/p/DTQgvRRkaCR/
https://www.instagram.com/p/DTRSoDjgdQI/
https://www.instagram.com/p/DTNokE7jQ-6/
https://www.instagram.com/p/DSklpK1jg-e/
https://www.instagram.com/p/DTGyOWTj-nJ/
https://www.instagram.com/p/DTMC42FgC5t/
https://www.instagram.com/p/DTOCmhVmA8j/
https://www.instagram.com/p/DTG-NR9EsA2/
https://www.instagram.com/p/DTIcR52lW4-/
https://www.instagram.com/p/DTI-5E_EuBf/
https://www.instagram.com/p/DS-Xt8QDAVZ/
https://www.instagram.com/p/DTGYB00AeSJ/
https://www.instagram.com/p/DTBg2ctgRvb/
https://www.instagram.com/p/DTCLyLxjb7j/
https://www.instagram.com/p/DS7vQOPD8GC/
https://www.instagram.com/p/DS489ywDJG0/
https://www.instagram.com/p/DS3kbCbDJbc/
https://www.instagram.com/p/DS_jxRNlMIw/
https://www.instagram.com/p/DS7vqoljkJ4/
https://www.instagram.com/p/DS5iBKIgDjr/
https://www.instagram.com/p/DS51nvID7UJ/
https://www.instagram.com/p/DSxaBeJjTLs/
https://www.instagram.com/p/DSkuGdTko0O/
https://www.instagram.com/p/DSX_D0CEWcp/
https://www.instagram.com/p/DSGWXmzj6c4/
https://www.instagram.com/p/DSoRAlvFA2I/
https://www.instagram.com/p/DSV3HiwiZvi/
https://www.instagram.com/p/DRS1zSsEnnd/
https://www.instagram.com/p/DSnb_QzEjgK/
https://www.instagram.com/p/DSv-npEiS4Z/
https://www.instagram.com/p/DSbqUs0EtVv/
https://www.instagram.com/p/DSpyC_qlLV7/
https://www.instagram.com/p/DSvwH6TknIy/
https://www.instagram.com/p/DSaoVGdj-9Y/
https://www.instagram.com/p/DSoU1DEj5MR/
https://www.instagram.com/p/DSeENuuj0b8/
https://www.instagram.com/p/DSs83o6EimZ/
https://www.instagram.com/p/DSswxWPkj02/
https://www.instagram.com/p/DSqKtySD4n6/
https://www.instagram.com/p/DSnJ-mODfYE/
https://www.instagram.com/p/DSqB9kfkgYN/
https://www.instagram.com/p/DSp46pqEjih/
https://www.instagram.com/p/DSqYU86khMH/
https://www.instagram.com/p/DSqZSutEvtA/
https://www.instagram.com/p/DSnxH4yDB3u/
https://www.instagram.com/p/DSqaBQMkqqx/
https://www.instagram.com/p/DSGHd9mD1AF/
https://www.instagram.com/p/DSqowTFD5cA/
https://www.instagram.com/p/DSoC8GIgdy9/
https://www.instagram.com/p/DSoIN0jkhZZ/
https://www.instagram.com/p/DSlBGeFloNd/
https://www.instagram.com/p/DSnKSwREyt4/
https://www.instagram.com/p/DSkol0ZkaM6/
https://www.instagram.com/p/DSBTXfgj-_9/
https://www.instagram.com/p/DSgcEsdEpy-/
https://www.instagram.com/p/DSgHKpsEh3R/
https://www.instagram.com/p/DSd1k8ID9TH/
https://www.instagram.com/p/DRzz-duj4Y6/
https://www.instagram.com/p/DSDaGUWEhag/
https://www.instagram.com/p/DSdxhOliSR5/
https://www.instagram.com/p/DSbM4_sAaBY/
https://www.instagram.com/p/DSdSjh2kcvh/
https://www.instagram.com/p/DOKgoEeDBA6/
https://www.instagram.com/p/DSdgZPeDICO/
https://www.instagram.com/p/DScyv4ODNA-/
https://www.instagram.com/p/DSc0lODkQTr/
https://www.instagram.com/p/DSbc8O-DOKI/
https://www.instagram.com/p/DSTmPUXD2LU/
https://www.instagram.com/p/DSQ6wz4D1GW/
https://www.instagram.com/p/DSX0a7Vk_Z1/
https://www.instagram.com/p/DSXjZvFjghE/
https://www.instagram.com/p/DSI80MwCOGE/
https://www.instagram.com/p/DSYh8yqEjMU/
https://www.instagram.com/p/DR0p2VGDCWt/
https://www.instagram.com/p/DSIlfPGEzQP/
https://www.instagram.com/p/DSBJGYPE_0f/
https://www.instagram.com/p/DSVDq79EnbN/
https://www.instagram.com/p/DSTKB5XEYIj/
https://www.instagram.com/p/DSLG0fOkrfH/
https://www.instagram.com/p/DSS416CksMe/
https://www.instagram.com/p/DSItZXlF7Ho/
https://www.instagram.com/p/DSMQjLcDFPg/
https://www.instagram.com/p/DSImYt6D0ZE/
https://www.instagram.com/p/DR7gyq6j_2z/
https://www.instagram.com/p/DSD36QuDQpK/
https://www.instagram.com/p/DR4vilZjZCP/
https://www.instagram.com/p/DRKhudujcfo/
https://www.instagram.com/p/DRzxZmQEx--/
https://www.instagram.com/p/DSEIr7yicsJ/
https://www.instagram.com/p/DSFcjq2EoBm/
https://www.instagram.com/p/DSDq_7xkcgv/
https://www.instagram.com/p/DR5r-o9CdvC/
https://www.instagram.com/p/DSC6fjVjNWz/
https://www.instagram.com/p/DSDpmYwCQFC/
https://www.instagram.com/p/DR-jTA_El9Q/
https://www.instagram.com/p/DSC8NbHDVo8/
https://www.instagram.com/p/DR9vsz5guZO/
https://www.instagram.com/p/DR8AnkVDjK3/
https://www.instagram.com/p/DR8jMHREZ6V/
https://www.instagram.com/p/DR48PhuDoEH/
https://www.instagram.com/p/DR5KscGjdkJ/
https://www.instagram.com/p/DR0IZ9FiqB9/
https://www.instagram.com/p/DRw0c1iDfw5/
https://www.instagram.com/p/DRxCLtKE4VU/
https://www.instagram.com/p/DRLVzdgkTqT/
https://www.instagram.com/p/DRvaYb9DYD9/
https://www.instagram.com/p/DRHsx9ojlVn/
https://www.instagram.com/p/DRnN5T1Dfdv/
https://www.instagram.com/p/DRnd3dcDYid/
https://www.instagram.com/p/DRlgj9QEpdo/
https://www.instagram.com/p/DRicJD0DrkI/
https://www.instagram.com/p/DRkxkKoErRf/
https://www.instagram.com/p/DRk9aPCDXq-/
https://www.instagram.com/p/DRherL0jrTb/
https://www.instagram.com/p/DRiN8b_CbE1/
https://www.instagram.com/p/DRiPDUPDwIv/
https://www.instagram.com/p/DRVkhDCkl88/
https://www.instagram.com/p/DRiTGovEhCn/
https://www.instagram.com/p/DRf382sjUiJ/
https://www.instagram.com/p/DQZ1FOeESEd/
https://www.instagram.com/p/DRVX4Dvj40X/
https://www.instagram.com/p/DRS-XyXFRaw/
https://www.instagram.com/p/DRSkWTliXY9/
https://www.instagram.com/p/DRhhG-qEUrW/
https://www.instagram.com/p/DQ7tKz6CSPG/
https://www.instagram.com/p/DRbpQhkDwKh/
https://www.instagram.com/p/DRcQPqDEq4i/
https://www.instagram.com/p/DRf5BcyALft/
https://www.instagram.com/p/DRgUVVrkVW1/
https://www.instagram.com/p/DRaItOXkmBt/
https://www.instagram.com/p/DRVIw6NkWcH/
https://www.instagram.com/p/DRenMOojIu-/
https://www.instagram.com/p/DRfAFrvEWdl/
https://www.instagram.com/p/DRbQUcojapi/
https://www.instagram.com/p/DRdGitYjrcH/
https://www.instagram.com/p/DRTzbdOkaZz/
https://www.instagram.com/p/DRa7P2DiFUr/
https://www.instagram.com/p/DRdbv6QD-Mp/
https://www.instagram.com/p/DRDr9xaEU4r/
https://www.instagram.com/p/DRctIKLET5T/
https://www.instagram.com/p/DRYI2_Zku5I/
https://www.instagram.com/p/DRSm8EEkTXu/
https://www.instagram.com/p/DRV7iCTjg08/
https://www.instagram.com/p/DRVLKYFEtyA/
https://www.instagram.com/p/DRSXiH3jTFZ/
https://www.instagram.com/p/DRSnkDijfKQ/
https://www.instagram.com/p/DRKke7PjpY4/
https://www.instagram.com/p/DRU6V7Yljno/
https://www.instagram.com/p/DRR08DdjF7E/
https://www.instagram.com/p/DRNI0erDuUI/
https://www.instagram.com/p/DRV1jAYjAVt/
https://www.instagram.com/p/DRSR9RPEsT4/
https://www.instagram.com/p/DRR8meMkSzk/
https://www.instagram.com/p/DRSR6Rejo3F/
https://www.instagram.com/p/DRSWc3Pik7l/
https://www.instagram.com/p/DRNfd1VFvOR/
https://www.instagram.com/p/DRKdxHzEwUG/
https://www.instagram.com/p/DRNsWyskiD6/
https://www.instagram.com/p/DRQEh4iD5fg/
https://www.instagram.com/p/DRQr-1GjAUr/
https://www.instagram.com/p/DRPaNCADLdV/
https://www.instagram.com/p/DRDdwlaD5DL/
https://www.instagram.com/p/DRLpLQ4EcF4/
https://www.instagram.com/p/DRI7K21Cdmq/
https://www.instagram.com/p/DRBQYcWCQq8/
https://www.instagram.com/p/DRA1N-DFXMQ/
https://www.instagram.com/p/DQ8E1mAERd-/
https://www.instagram.com/p/DQ9j-idj1Rq/
https://www.instagram.com/p/DQ-Y9wqktCg/
https://www.instagram.com/p/DQ7Cji3iXGM/
https://www.instagram.com/p/DQ5X6Abj6BD/
https://www.instagram.com/p/DQ0IJOBEr2L/
https://www.instagram.com/p/DQzM57TkTK9/
https://www.instagram.com/p/DQzbGdMlKHc/
https://www.instagram.com/p/DQws5lFCeyk/
https://www.instagram.com/p/DQxFyO0APsq/
https://www.instagram.com/p/DQpx_T7gql0/
https://www.instagram.com/p/DQu6wKlEoNs/
https://www.instagram.com/p/DQudnz_k6oD/
https://www.instagram.com/p/DP-L13lAPoA/
https://www.instagram.com/p/DQsT6ULklK5/
https://www.instagram.com/p/DQsRsoyEngO/
https://www.instagram.com/p/DQo-6AiicVR/
https://www.instagram.com/p/DQrjczFCcWx/
https://www.instagram.com/p/DQpVLo5Ekbf/
https://www.instagram.com/p/DQrdnwGjtL9/
https://www.instagram.com/p/DQK5Zr0Em8a/
https://www.instagram.com/p/DQQNqtWDvnF/
https://www.instagram.com/p/DQr-3aYkrZi/
https://www.instagram.com/p/DQp9KS7DAQz/
https://www.instagram.com/p/DQpPewbD0cG/
https://www.instagram.com/p/DQp2Y9_EhRe/
https://www.instagram.com/p/DQpd6XNkhpX/
https://www.instagram.com/p/DQmNYH6jASY/
https://www.instagram.com/p/DQqTIkFEVHk/
https://www.instagram.com/p/DQpBp_NDzg_/
https://www.instagram.com/p/DQqguCKkoA_/
https://www.instagram.com/p/DQmxE70EZcU/
https://www.instagram.com/p/DQpaV4-EczT/
https://www.instagram.com/p/DQiS7diieRS/
https://www.instagram.com/p/DQZt2OIDqBh/
https://www.instagram.com/p/DQSkN8BjEst/
https://www.instagram.com/p/DQe7V90Dtmx/
https://www.instagram.com/p/DPxTEGvAT9-/
https://www.instagram.com/p/DQealXFCTeX/
https://www.instagram.com/p/DQeldqrDa9G/
https://www.instagram.com/p/DQeofkhjq5A/
https://www.instagram.com/p/DQfH42rjGVi/
https://www.instagram.com/p/DQXPBPDkna3/
https://www.instagram.com/p/DUTetWfgVcr/
https://www.instagram.com/p/DUTShQ8Dwup/
https://www.instagram.com/p/DT03lV4CVAM/
https://www.instagram.com/p/DT3VTuSCnQo/
https://www.instagram.com/p/DUGwyXXjm3-/
https://www.instagram.com/p/DUEkJc2Dial/
https://www.instagram.com/p/DUMBEzSlt6L/
https://www.instagram.com/p/DUQkzbTjXmP/
https://www.instagram.com/p/DTth5y2klRG/
https://www.instagram.com/p/DTjcHmgEZ_t/
https://www.instagram.com/p/DUTMyCSjRAv/
https://www.instagram.com/p/DURWSFPEqKN/
https://www.instagram.com/p/DUTsin5CZWE/
https://www.instagram.com/p/DUULwuMEq5G/
https://www.instagram.com/p/DUURKV0jWOQ/
https://www.instagram.com/p/DUVz-56EQ5H/
https://www.instagram.com/p/DUUY3QADVWD/
https://www.instagram.com/p/DSgJ5zYgOxp/
https://www.instagram.com/p/DUTxHAcE4Qx/
https://www.instagram.com/p/DUWS655kvKy/
https://www.instagram.com/p/DUW9EWAkZLB/
https://www.instagram.com/p/DUUC24AEQEc/
https://www.instagram.com/p/DTkrdZ8kWol/
https://www.instagram.com/p/DUVj5Ipkonj/
https://www.instagram.com/p/DTdCtFigOJR/
https://www.instagram.com/p/DUSAXKaDZ1d/
https://www.instagram.com/p/DUV6aelgHYB/
https://www.instagram.com/p/DUWioyhk3Ci/
https://www.instagram.com/p/DUY48AYjCPD/
https://www.instagram.com/p/DT0ODhNDItt/
https://www.instagram.com/p/DUTijwTj8KB/
https://www.instagram.com/p/DUTvd-HAXDx/
https://www.instagram.com/p/DRXc88oCcAy/
https://www.instagram.com/p/DUBU-s6klgX/
https://www.instagram.com/p/DTkhbIpj5_f/
https://www.instagram.com/p/DUNfMUHEfs3/
https://www.instagram.com/p/DRh1q7Ijjj0/
https://www.instagram.com/p/DT4PfDgjOFl/
https://www.instagram.com/p/DQ2LZVckv-L/
https://www.instagram.com/p/DUYx60ojaBH/
https://www.instagram.com/p/DTzUUH9DPDA/
https://www.instagram.com/p/DUUBgsZE5Cr/
https://www.instagram.com/p/DUTjTPLDtWi/
https://www.instagram.com/p/DUOQgLwlqwS/
https://www.instagram.com/p/DSJFalfEeoJ/
https://www.instagram.com/p/DUUFwPyCT2W/
https://www.instagram.com/p/DUZIv-FEvfI/
https://www.instagram.com/p/DUZknFQkVGZ/
https://www.instagram.com/p/DUZjGs_DOFz/
https://www.instagram.com/p/DT_1WOjiUC6/
https://www.instagram.com/p/DTjA8MBjcgI/
https://www.instagram.com/p/DUZKCimEkrt/
https://www.instagram.com/p/DUYKvhADVxI/
https://www.instagram.com/p/DUY5g9uCYyT/
https://www.instagram.com/p/DUYZ9Nylw6e/
https://www.instagram.com/p/DUZpGULD2gX/
https://www.instagram.com/p/DUWRM_pEvdj/
https://www.instagram.com/p/DUYLpW9keV8/
https://www.instagram.com/p/DUZN6PRkyut/
https://www.instagram.com/p/DUWkNYBDeJG/
https://www.instagram.com/p/DUZfl4EiTei/
https://www.instagram.com/p/DT6BLQVElrx/
https://www.instagram.com/p/DUbo5vbAYtZ/
https://www.instagram.com/p/DUYh7oTkZ1O/
https://www.instagram.com/p/DUEk6yokrJz/
https://www.instagram.com/p/DT-hFoODsAB/
https://www.instagram.com/p/DUb0aRKEher/
https://www.instagram.com/p/DUeabmyDUT7/
https://www.instagram.com/p/DUToUmIkm6o/
https://www.instagram.com/p/DUbEpaGjPY-/
https://www.instagram.com/p/DUT1R1ZjJ_e/
https://www.instagram.com/p/DT5qUpjAJEg/
https://www.instagram.com/p/DUYpvzFEVqL/
https://www.instagram.com/p/DUTGi7GAFyB/
https://www.instagram.com/p/DUejYGoD-zN/
https://www.instagram.com/p/DUeosYrDNN0/
https://www.instagram.com/p/DUEzwziFV5h/
https://www.instagram.com/p/DUWwYqeji9K/
https://www.instagram.com/p/DUJ3yItiptC/
https://www.instagram.com/p/DTePqx_iHLt/
https://www.instagram.com/p/DUbN5S7jxZc/
https://www.instagram.com/p/DTT3BTygZ_f/
https://www.instagram.com/p/DTqiHXTkoc_/
https://www.instagram.com/p/DUczvToEchL/
https://www.instagram.com/p/DTRNWKSEisY/
https://www.instagram.com/p/DT1XamgDxX6/
https://www.instagram.com/p/DUcB5i2AGQu/
https://www.instagram.com/p/DUBiECrk7kg/
https://www.instagram.com/p/DTyQqG2Esv5/
https://www.instagram.com/p/DUAbafODzho/
https://www.instagram.com/p/DT3DSQugGWI/
https://www.instagram.com/p/DTsv-xZkdkr/
https://www.instagram.com/p/DUY4BXckd0B/
https://www.instagram.com/p/DUd3rgOj-6o/
https://www.instagram.com/p/DTi0_1kkpZY/
https://www.instagram.com/p/DUbdmr-jynq/
https://www.instagram.com/p/DUULpHqkSOm/
https://www.instagram.com/p/DTbV54Xju80/
https://www.instagram.com/p/DTyBtrpjN6U/
https://www.instagram.com/p/DTTVUMPgkwD/
https://www.instagram.com/p/DUT6ydWD-a2/
https://www.instagram.com/p/DUOcOFEkujZ/
https://www.instagram.com/p/DUL_6NoklUl/
https://www.instagram.com/p/DUEKmq0ErzN/
https://www.instagram.com/p/DUQ4rxtAI1u/
https://www.instagram.com/p/DUBTVH2DBDB/
https://www.instagram.com/p/DUeYxyUEd_E/
https://www.instagram.com/p/DUjikasknF5/
https://www.instagram.com/p/DUjnar3CRWF/
`.trim();

const CONCURRENCY = 3;

async function pLimit(tasks: (() => Promise<void>)[], concurrency: number) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) await tasks[i++]();
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  const rawUrls = URLS.split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));

  // Normalize: strip query params
  const urls = [...new Set(rawUrls.map((u) => {
    try {
      const parsed = new URL(u);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return u;
    }
  }))];

  console.log(`\n📋 ${urls.length} unique URLs to process\n`);

  // Check which already exist
  const existing = await prisma.incident.findMany({
    where: { url: { in: urls } },
    select: { url: true, id: true, status: true },
  });
  const existingUrls = new Set(existing.map((e) => e.url));

  const newUrls = urls.filter((u) => !existingUrls.has(u));
  console.log(`  Already in DB: ${existing.length}`);
  console.log(`  New to add:    ${newUrls.length}\n`);

  // Create new RAW incidents
  if (newUrls.length > 0) {
    await prisma.incident.createMany({
      data: newUrls.map((url) => ({ url, status: "RAW" })),
    });
    console.log(`  ✅ Created ${newUrls.length} new RAW incidents\n`);
  }

  // Fetch all IDs to process (new ones + any existing that are RAW/FAILED)
  const toProcess = await prisma.incident.findMany({
    where: {
      url: { in: urls },
      OR: [{ status: "RAW" }, { status: "FAILED" }],
    },
    select: { id: true, url: true },
    orderBy: { id: "asc" },
  });

  if (toProcess.length === 0) {
    console.log("All incidents already processed. Done.");
    await prisma.$disconnect();
    return;
  }

  console.log(`📱 Processing ${toProcess.length} incidents (${CONCURRENCY} concurrent)...\n`);

  let done = 0;
  let succeeded = 0;
  let failed = 0;

  const tasks = toProcess.map(({ id, url }) => async () => {
    const n = ++done;
    try {
      await processInstagramPipeline(id);
      const inc = await prisma.incident.findUnique({ where: { id }, select: { headline: true } });
      succeeded++;
      console.log(`  ✅ [${n}/${toProcess.length}] #${id} ${inc?.headline || "(no headline)"}`);
    } catch (err: any) {
      failed++;
      console.error(`  ❌ [${n}/${toProcess.length}] #${id} FAILED: ${err.message?.slice(0, 80)}`);
    }
  });

  await pLimit(tasks, CONCURRENCY);

  console.log(`\n🏁 Done: ${succeeded} succeeded, ${failed} failed out of ${toProcess.length}.\n`);

  if (failed > 0) {
    const stillFailed = await prisma.incident.findMany({
      where: { url: { in: urls }, status: "FAILED" },
      select: { id: true, url: true, errorMessage: true },
    });
    console.log("Still failing:");
    stillFailed.forEach((inc) => {
      console.log(`  #${inc.id}  ${inc.url}`);
      console.log(`         → ${inc.errorMessage}`);
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
