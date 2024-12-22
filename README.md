# civitai-metadata-json

Collect used metadata by model in civitai

## Usage

Copy the [latest.json](https://raw.githubusercontent.com/shinich39/civitai-metadata-json/refs/heads/main/dist/latest.json) file from dist directory and use it.  

```js
// dist/latest.json
{
  "updatedAt": "2023-07-29T20:50:47.173Z",
  "modelId": 4384,
  "modelName": "DreamShaper",
  "versionId": 128713,
  "versionName": "8",
  "filenames": [
    "dreamshaper_8"
  ],
  "stats": {
    "downloadCount": 593387,
    "ratingCount": 3181,
    "rating": 4.82,
    "thumbsUpCount": 11147,
    "thumbsDownCount": 110
  },
  "metadata": [
    {
      "w": 512,
      "h": 832,
      "pp": "(masterpiece), (extremely intricate:1.3), (realistic), portrait of a girl, the most beautiful in the world, (medieval armor), metal reflections, upper body, outdoors, intense sunlight, far away castle, professional photograph of a stunning woman detailed, sharp focus, dramatic, award winning, cinematic lighting, octane render  unreal engine,  volumetrics dtx, (film grain, blurry background, blurry foreground, bokeh, depth of field, sunset, motion blur:1.3), chainmail",
      "np": "BadDream, (UnrealisticDream:1.3)",
      "seed": 5775713,
      "steps": 30,
      "sampler": "DPM++ SDE Karras",
      "cfg": 9
    },
    // ...
  ]
}
```