// #popclip
// name: Kavel
// identifier: ai.kavel.popclip.generate
// description: Turn the selected text into an AI image with Kavel and open it.
// icon: symbol:photo.artframe
// popclip version: 4688
// keywords: ai image generator text to image picture prompt
// apps:
// - { name: Kavel, link: 'https://www.kavel.ai/image' }
// entitlements: [network]

import axios from "axios";

export const options = [
  {
    identifier: "apikey",
    label: "Kavel API key (optional)",
    type: "secret",
    description:
      "Leave empty to use the free tier (watermarked, a couple of images a day). Keys: kavel.ai/settings/apikeys",
  },
] as const;

type Options = InferOptions<typeof options>;

const BASE = "https://www.kavel.ai";

// The free tier keys its wallet on x-anon-id; submit and poll below share one id.
const clientId = (): string => "popclip-" + Math.random().toString(36).slice(2, 12);

export const action: ActionFunction<Options> = async (input, options) => {
  const prompt = input.text.trim();
  if (!prompt) return;
  const key = options.apikey?.trim();
  const auth = key ? { authorization: `Bearer ${key}` } : { "x-anon-id": clientId() };

  const submit = await axios.post(
    `${BASE}/api/ai/generate`,
    {
      provider: "kie",
      mediaType: "image",
      model: "kavel-image-v1",
      scene: "text-to-image",
      prompt: prompt.slice(0, 2000),
      options: { aspect_ratio: "1:1" },
    },
    { headers: { "content-type": "application/json", ...auth } },
  );
  const data = submit.data?.data ?? {};
  // Running out of free credits is HTTP 200 with data.wall, not an error status.
  if (data.wall) {
    popclip.showText("Free Kavel images are used up for today. Add an API key in the extension settings.");
    return;
  }
  const taskId: string | undefined = data.id;
  if (!taskId) {
    popclip.showText(submit.data?.message || "Kavel refused the request.");
    return;
  }

  // A free job waits in a queue and only starts when polled, so keep polling.
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = key
      ? await axios.post(`${BASE}/api/ai/query`, { taskId }, { headers: { "content-type": "application/json", ...auth } })
      : await axios.get(`${BASE}/api/ai/anon-query`, {
          params: { taskId, provider: "kie", mediaType: "image" },
          headers: auth,
        });
    const d = res.data?.data ?? {};
    const url: string | undefined = d.cleanImages?.[0] ?? d.images?.[0];
    if (url) {
      popclip.openUrl(url);
      return;
    }
    if (d.status === "failed" || d.status === "error") {
      popclip.showText("Kavel could not make that image. Try rewording the text.");
      return;
    }
  }
  popclip.showText("Still rendering after five minutes. Try again.");
};
