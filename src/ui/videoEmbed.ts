import { facebookEmbedUrl, type VideoSource } from '../domain/model';

/** URL du lecteur intégré (iframe) pour YouTube / Facebook. */
export function embedUrl(src: VideoSource, autoplay = true): string | null {
  if (!src) return null;
  if (src.type === 'youtube') return `https://www.youtube.com/embed/${src.id}?autoplay=${autoplay ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`;
  if (src.type === 'facebook') return facebookEmbedUrl(src.url);
  return null;
}

/** Page HTML minimale contenant le lecteur (utilisée par la WebView mobile). */
export function embedHtml(src: VideoSource, autoplay = true): string {
  const body =
    src?.type === 'file'
      ? `<video src="${src.url}" controls ${autoplay ? 'autoplay' : ''} playsinline style="width:100%;height:100%;background:#000"></video>`
      : `<iframe src="${embedUrl(src, autoplay) ?? ''}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen style="border:0;width:100%;height:100%"></iframe>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style></head><body>${body}</body></html>`;
}
