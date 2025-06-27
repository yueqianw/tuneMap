# Image-to-Music Backend

A REST service that converts one or more **geo-tagged images** into a short piece of location-aware music.

---

## Features

* **Automatic image captioning** with BLIP  
* **Style inference** from visuals via CLIP (falls back to user hint)  
* **Traditional scale detection** (maqam, raga, etc.) with Wikipedia + Flan-T5 probing  
* **Dynamic, key, tempo** cues extracted from hue, brightness and edge density  
* **Prompt assembly** for Meta MusicGen-small, then WAV post-processing to 44.1 kHz stereo  
* **Stateless Flask API**—just send images and coordinates, get a `.wav` file back  

---

## Dependencies (when running the code yourself)

| Library | Purpose |
|---------|---------|
| `torch`, `torchaudio`, `torchvision` | Model back-end, resampling |
| `transformers` | BLIP, CLIP, Flan-T5, MusicGen |
| `encodec` | Audio codec used by MusicGen |
| `soundfile` | WAV write |
| `Pillow` | Image I/O |
| `geopy` | Reverse-geocoding |
| `wikipedia` | Traditional-scale lookup |
| `flask`, `flask-cors`, `werkzeug` | REST server |
| `bitsandbytes`, `triton` | Optional 8-bit GPU quantization |

## How the Algorithm Works

1. **Captioning**  
   * Each image is passed through **BLIP** to generate a short natural-language description.  
   * If `refine_description=true`, every caption is expanded by **Flan-T5** for additional detail.

2. **Visual cue analysis**  
   * Images are converted to HSV and greyscale.  
   * Algorithms derive:  
     * **Key mode** – warm average hue → major, cool hue → minor.  
     * **Dynamics** – mean brightness (value channel).  
     * **Tempo** – edge-density heuristic (Sobel gradient).

3. **Style selection**  
   * If the client specifies `style`, it is used directly.  
   * Otherwise **CLIP** ranks ten candidate style words (`ambient`, `folk`, `epic`, …) against the images; the top score wins.

4. **Traditional mode search**  
   * Coordinates are reverse-geocoded to a country with **geopy**.  
   * Wikipedia summaries are scanned for modal keywords (maqam, raga, pelog, etc.).  
   * If no hit, Flan-T5 is queried: “Name one traditional musical scale or mode used in the folk music of X.”

5. **Prompt assembly**  
   * Combines location label, style, key mode, dynamics, tempo, traditional scale (if any), and all image captions into a single paragraph formatted for MusicGen.

6. **Music synthesis**  
   * The prompt is sent to **MusicGen-small** (`transformers` text-to-audio pipeline).  
   * Token count is `duration_sec × 50` to roughly match the requested length.

7. **Post-processing and response**  
   * Output is resampled to **44.1 kHz stereo** (if needed) and saved as a temporary WAV.  
   * Flask streams the file back as the response body (`audio/wav`, attachment `generated_music.wav`).

## Using the Cloud API

The backend is deployed on Google Cloud Run.

### `POST https://music-api-979997461127.us-central1.run.app/api/generate-music`

| Field (multipart)      | Type    | Required | Description                                                     |
|------------------------|---------|----------|-----------------------------------------------------------------|
| `images`               | file[]  | yes      | One or more `.jpg` / `.png` files                               |
| `latitude`             | float   | yes      | Decimal degrees                                                 |
| `longitude`            | float   | yes      | Decimal degrees                                                 |
| `style`                | string  | no       | Override auto-style (`ambient`, `folk`, `epic`, …)              |
| `refine_description`   | bool    | no       | `true` *(default)* expands BLIP captions with Flan-T5           |
| `duration_sec`         | int     | no       | Output length in seconds (default `30`)                         |

**cUrl example**
```bash
& curl.exe -v -X POST "https://music-api-979997461127.us-central1.run.app/api/generate-music" `
   -F "images=@/path/img1.jpg" `
   -F "images=@/path/img2.jpg" `
   -F "latitude=39.9" `
   -F "longitude=116.4" `
   -F "refine_description=false" `
   --output generated_music.wav

