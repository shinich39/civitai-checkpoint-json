"use strict";

import fs from "node:fs";
import path from "node:path";
import * as cheerio from 'cheerio';
import moment from "moment";
import dotenv from "dotenv";
import { queryObject } from "./libs/utils.mjs";

dotenv.config();

const CONTINUE = false;
const OUTPUT_PATH = "./dist/latest.json";
const BACKUP_PATH = `./dist/${moment().format("YYYYMMDD")}.json`;
const INFO_PATH = `./dist/info.json`;
const MAX_MODEL_COUNT = 11;
const MAX_IMAGE_COUNT = 100;
const MIN_DOWNLOAD_COUNT = 390;
const MAX_COLLECT_COUNT = 10;
const REQUIRED_KEYS = [
  "Size",
  "prompt",
  "negativePrompt",
  "seed",
  // "Clip skip",
  "steps",
  "sampler",
  "Denoising strength",
  "cfgScale",
];

async function getModels(limit, nextPage) {
  const params = new URLSearchParams({
    limit,
    types: "Checkpoint",
    sort: "Most Downloaded",
  });

  const url = nextPage || "https://civitai.com/api/v1/models?"+params.toString();
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.API_KEY}`,
  }

  // console.log("URL:", url);
  // console.log("Headers:", headers);

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw new Error(`HTTP error! Status: ${res.status}`);
  }

  return await res.json();  
}

async function getImages(modelId, modelVersionId, username) {
  const params = new URLSearchParams({
    limit: MAX_IMAGE_COUNT,
    modelId,
    modelVersionId,
    username,
  });

  const url = "https://civitai.com/api/v1/images?"+params.toString();
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.API_KEY}`,
  }

  // console.log("URL:", url);
  // console.log("Headers:", headers);

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw new Error(`HTTP error! Status: ${res.status}`);
  }

  return await res.json();
}

function debug(obj) {
  fs.writeFileSync("./debug.json", JSON.stringify(obj, null , 2), "utf-8");
}

function isTagString(str) {
  str = str.replace(/\s/g, "");
  return /([a-zA-Z0-9]{,12},){3,}/.test(str) &&
    !/[0-9]{3,}x[0-9]{3,}/.test(str);
}

function getDataFromImage(image) {
  if (!image?.meta) {
    return;
  }

  if ((!image.width || !image.height) && !image.meta.Size) {
    return;
  }
  
  for (const key of REQUIRED_KEYS) {
    if (!image.meta[key]) {
      return;
    }
  }

  let w, h;
  if (image.meta.Size) {
    w = parseInt(image.meta.Size.split("x")[0]);
    h = parseInt(image.meta.Size.split("x")[1]);
    if (isNaN(w) || isNaN(h)) {
      w = undefined;
      h = undefined;
    }
  }
  
  if (!w && !h) {
    w = image.width;
    h = image.height;
  }

  // Optimize keyname
  return {
    w: w || undefined,
    h: h || undefined,
    pp: image.meta.prompt || undefined,
    np: image.meta.negativePrompt || undefined,
    seed: image.meta.seed || undefined,
    // clipSkip: image.meta["Clip skip"] || undefined,
    steps: image.meta.steps || undefined,
    strength: image.meta["Denoising strength"] || undefined,
    sampler: image.meta.sampler || undefined,
    cfg: image.meta.cfgScale || undefined,
  };

  // return {
  //   positivePrompt: image.meta.prompt || undefined,
  //   negativePrompt: image.meta.negativePrompt || undefined,
  //   steps: image.meta.steps || undefined,
  //   denoisingStrength: image.meta["Denoising strength"] || undefined,
  //   sampler: image.meta.sampler || undefined,
  //   cfgScale: image.meta.cfgScale || undefined,
  // };
}

function getStatFromModel(model) {
  if (!image?.stats) {
    return {
      dCnt: 0,
      fCnt: 0,
      cCnt: 0,
      rCnt: 0,
      rating: 0,
    }
  }

  return {
    dCnt: image.stats.downloadCount || 0,
    fCnt: image.stats.favoriteCount || 0,
    cCnt: image.stats.commentCount || 0,
    rCnt: image.stats.ratingCount || 0,
    rating: image.stats.rating || 0,
  };
}

;(async () => {
  let lastURL;

  if (CONTINUE) {
    const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
    lastURL = prev.lastURL;
  }

  let isReached = false,
      modelCount = 0,
      imageCount = 0,
      page = 0,
      modelRes = await getModels(MAX_MODEL_COUNT, lastURL);

  // debug(res);

  while(!isReached) {
    const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
    console.log(`Page[${page++}]: ${modelRes.items.length} models found`);

    if (!prev.data) {
      prev.data = [];
    }

    // Debug
    // for (let i = 0; i < modelRes.items.length; i++) {
    //   console.log(`Model[${i}]: ${modelRes.items[i].name}`);
    // }

    for (const model of modelRes.items) {
      if (!model?.creator?.username) {
        console.error(`${model.name}'s creator not found`);
        continue;
      }
      if (model.stats.downloadCount < MIN_DOWNLOAD_COUNT) {
        console.error(`${model.name}'s downloadCount is ${model.stats.downloadCount}`);
        isReached = true;
        break;
      }

      console.log(`Model(${modelCount++}): ${model.name}`);
  
      for (const version of model.modelVersions) {
        const updatedAt = version.publishedAt || version.updatedAt || version.createdAt;
  
        // Check updated date
        const prevData = prev.data.find((item) => item.modelId == model.id && 
          item.versionId == version.id);

        if (prevData) {
          // console.log(`Previous data found: ${model.name}:${version.name}`);
          if (prevData.updatedAt && updatedAt && prevData.updatedAt == updatedAt) {
            console.log(`No update yet: ${prevData.updatedAt} == ${updatedAt}`);
            continue;
          }
        }

        let meta = [];
        const imageRes = await getImages(model.id, version.id, model.creator.username);
        // console.log(`${imageRes.items.length} images found`);
        for (const image of imageRes.items) {
          // console.log(`Image(${imageCount++})`);
          const data = getDataFromImage(image);
          if (data) {
            const dupe = meta.find((item) => queryObject(item, data));
            if (!dupe) {
              meta.push(data);
              if (meta.length >= MAX_COLLECT_COUNT) {
                break;
              }
            }
          }
        }
        // console.log(`${meta.length} data collected`);

        if (meta.length < 1) {
          continue;
        }
        
        let filenames = [];
        for (const file of version.files) {
          const extension = path.extname(file.name);
          const filename = path.basename(file.name, extension);
          filenames.push(filename);
        }

        // Remove duplicated values
        filenames = filenames.filter((item, index, arr) => arr.indexOf(item) == index);

        // const data = meta.reduce((acc, cur) => {
        //   const keys = Object.keys(acc);
        //   for (const key of keys) {
        //     const value = cur[key];
        //     if (!!value) {
        //       acc[key].push(value);
        //     }
        //   }
        //   return acc;
        // }, {
        //   positivePrompt: [],
        //   negativePrompt: [],
        //   steps: [],
        //   denoisingStrength: [],
        //   sampler: [],
        //   cfgScale: [],
        // });

        // Remove duplicated values
        // for (const key of Object.keys(data)) {
        //   const arr = data[key];
        //   arr.filter((item, index, arr) => arr.indexOf(item) == index);
        // }
  
        if (!prevData) {
          prev.data.push({
            updatedAt: updatedAt,
            modelId: model.id,
            modelName: model.name,
            versionId: version.id,
            versionName: version.name,
            filenames: filenames,
            stats: version.stats || {},
            metadata: meta,
          });
        } else {
          Object.assign(prevData, {
            updatedAt: updatedAt,
            modelId: model.id,
            modelName: model.name,
            versionId: version.id,
            versionName: version.name,
            filenames: filenames,
            stats: version.stats || {},
            metadata: meta,
          });
        }
      }

      console.log(`${prev.data.length} data collected`);
    }

    // Update
    prev.lastURL = lastURL;
    prev.dataCount = prev.data.length;
    prev.updatedAt = Date.now();

    // Sort
    prev.data = prev.data.sort((a, b) => 
      (b.stats.downloadCount || 0) - (a.stats.downloadCount || 0)
    );

    const updates = JSON.stringify(prev, null, 2);
    const info = JSON.stringify({
      lastURL: prev.lastURL,
      dataCount: prev.dataCount,
      updatedAt: prev.updatedAt,
    });

    fs.writeFileSync(OUTPUT_PATH, updates, "utf8");
    fs.writeFileSync(BACKUP_PATH, updates, "utf8");
    fs.writeFileSync(INFO_PATH, info, "utf8");

    if (modelRes.items.length < MAX_MODEL_COUNT || !modelRes?.metadata?.nextPage) {
      // End
      break;
    }

    lastURL = modelRes.metadata.nextPage;
    modelRes = await getModels(MAX_MODEL_COUNT, lastURL);
  }

  console.log("Finish");
})();