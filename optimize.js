"use strict";

import fs, { writeFileSync } from "node:fs";
import path from "node:path";
import moment from "moment";
import { queryObject } from "./libs/utils.mjs";

const OUTPUT_PATH = "./dist/latest.json";
const BACKUP_PATH = `./dist/${moment().format("YYYYMMDD")}.json`;
const INFO_PATH = `./dist/info.json`;

const orig = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));

orig.data = orig.data.map(e => {
  // Remove denoise
  for (const d of e.metadata) {
    delete d.strength;
  }
  return e;
});

writeFileSync(OUTPUT_PATH, JSON.stringify(orig), "utf8");
writeFileSync(BACKUP_PATH, JSON.stringify(orig, null, 2), "utf8");