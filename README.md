# civitai-metadata-json

Collect used metadata by model in civitai

## Usage

Copy the [latest.json](https://raw.githubusercontent.com/shinich39/civitai-metadata-json/refs/heads/main/dist/latest.json) file from dist directory and use it.  

```js
// dist/latest.json
{
  "updatedAt": number,
  "dataCount": number,
  "data": [
    {
      "updatedAt": "2023-07-29T20:50:47.173Z",
      "modelId": 4384,
      "modelName": "DreamShaper",
      "versionId": 128713,
      "versionName": "8",
      "filenames": [
        "dreamshaper_8" // dreamshaper_8.safetensor
      ],
      "stats": {
        "downloadCount": 593387,
        "ratingCount": 3181,
        "rating": 4.82,
        "thumbsUpCount": 11147,
        "thumbsDownCount": 110
      },
      "metadata": {
        "w": number|undefined, // Width
        "h": number|undefined, // Height
        "pp": string|undefined, // Positive prompts
        "np": string|undefined, // Negative prompts
        "seed": number|undefined,
        "steps": number|undefined,
        "strength": number|undefined, // Denoising strenth
        "sampler": string|undefined,
        "cfg": number|undefined, // cfgScale
      }
    }
  ]
}
```