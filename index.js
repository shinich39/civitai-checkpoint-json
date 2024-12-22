"use strict";

import fs from "node:fs";
import path from "node:path";
import * as cheerio from 'cheerio';
import moment from "moment";
import dotenv from "dotenv";
import { queryObject } from "./libs/utils.mjs";

dotenv.config();

const CONTINUE = false;
const ENABLE_STOP = false;
const OUTPUT_PATH = "./dist/latest.json";
const BACKUP_PATH = `./dist/${moment().format("YYYYMMDD")}.json`;
const INFO_PATH = `./dist/info.json`;
const MAX_MODEL_COUNT = 11;
const MAX_IMAGE_COUNT = 100;
const MIN_DOWNLOAD_COUNT = 100;
const MAX_COLLECT_COUNT = 10;

const METADATA_KEYS = {
  // "size": ["Size"], 
  "pp": ["prompt", "Prompt",],
  "np": ["negativePrompt", "Negative Prompt",],
  "seed": ["seed","Seed",],
  // "clip": ["Clip skip",],
  "steps": ["steps", "Steps",],
  "sampler": ["Sampler", "sampler",],
  // "strength": ["Denoising strength", "Denoising Strength", "denoising strength", "Denoise", "denoise", "Strength", "strength"],
  "cfg": ["cfgScale", "cfg", "Guidance", "guidance",],
}

async function getModels(limit, nextPage) {
  const params = new URLSearchParams({
    limit,
    types: "Checkpoint",

    // query: "DreamShaper",
    
    // sort: "Newest",
    // sort: "Most Downloaded",
    sort: "Highest Rated",

    // period: "AllTime",
    // period: "Year",
    period: "Month",
    // period: "Week",
    // period: "Day",
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

  // Check requirements
  for (const [_, keys] of Object.entries(METADATA_KEYS)) {
    let found = false;
    for (const key of keys) {
      if (image.meta[key]) {
        found = true;
        break;
      }
    }
    if (!found) {
      return;
    }
  }

  let w, h;
  if (image.meta.Size) {
    const _w = parseInt(image.meta.Size.split("x")[0]);
    const _h = parseInt(image.meta.Size.split("x")[1]);
    if (!isNaN(_w) && !isNaN(_h)) {
      w = _w;
      h = _h;
    }
  }
  
  if (!w && !h) {
    w = image.width;
    h = image.height;
  }

  const result = {
    w: w,
    h: h,
  }

  for (const [label, keys] of Object.entries(METADATA_KEYS)) {
    for (const key of keys) {
      if (image.meta[key]) {
        result[label] = image.meta[key];
        break;
      }
    }
  }

  return result;
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

  if (CONTINUE && fs.existsSync(INFO_PATH)) {
    const info = JSON.parse(fs.readFileSync(INFO_PATH, "utf8"));
    lastURL = info.lastURL;
  }

  const prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
  if (!prev.data) {
    prev.data = [];
  }

  let modelCount = 0,
      imageCount = 0,
      modelRes = await getModels(MAX_MODEL_COUNT, lastURL);

  // debug(modelRes);

  while(true) {
    console.log(`${modelRes.items.length} models found`);

    const prevDataLen = prev.data.length;

    // Debug
    // for (let i = 0; i < modelRes.items.length; i++) {
    //   console.log(`Model[${i}]: ${modelRes.items[i].name}`);
    // }

    let stop = false;
    for (const model of modelRes.items) {

      if (!model?.creator?.username) {
        console.error(`${model.name}'s creator not found`);
        continue;
      }

      if (model.stats.downloadCount < MIN_DOWNLOAD_COUNT) {
        console.error(`${model.name}'s downloadCount is ${model.stats.downloadCount}`);
        if (ENABLE_STOP) {
          stop = true;
          break;
        } else {
          continue;
        }
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
            // console.log(`No update yet: ${prevData.updatedAt} == ${updatedAt}`);
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

      // console.log(`${prev.data.length} data collected`);
    }

    // Update
    prev.dataCount = prev.data.length;
    prev.updatedAt = Date.now();

    // Sort
    prev.data = prev.data.sort((a, b) => 
      (b.stats.downloadCount || 0) - (a.stats.downloadCount || 0)
    );

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(prev), "utf8");
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(prev, null, 2), "utf8");
    fs.writeFileSync(INFO_PATH, JSON.stringify({
      lastURL: lastURL,
      dataCount: prev.dataCount,
      updatedAt: prev.updatedAt,
    }), "utf8");

    console.log(`JSON updated: ${prevDataLen} => ${prev.data.length}`);

    if (stop) {
      break;
    }
    if (modelRes.items.length == 0 || !modelRes?.metadata?.nextPage) {
      console.log("No more models");
      break;
    }

    lastURL = modelRes.metadata.nextPage;
    modelRes = await getModels(MAX_MODEL_COUNT, lastURL);
  }

  console.log("Collection completed");
})();