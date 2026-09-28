// Local script assets work under file:// without changing browser security settings.
const pending = new Map<string, { resolve: (blob: Blob) => void; reject: (error: Error) => void }>();
const cached = new Map<string, Promise<Blob>>();
(globalThis as typeof globalThis & { __offlineAsset?: (key: string, mime: string, base64: string) => void }).__offlineAsset = (key: string, mime: string, base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  pending.get(key)?.resolve(new Blob([bytes], { type: mime }));
};
export function loadOfflineBlob(path: string): Promise<Blob> {
  const key = path.replace(/^\.\//, '').replace(/^\//, '').split('?')[0];
  if (cached.has(key)) return cached.get(key)!;
  const promise = new Promise<Blob>((resolve, reject) => {
    const script = document.createElement('script');
    pending.set(key, { resolve, reject });
    script.src = './offline/assets/' + key.replaceAll('/', '--') + '.js';
    script.onload = () => { script.remove(); pending.delete(key); };
    script.onerror = () => {
      script.remove(); pending.delete(key); cached.delete(key);
      reject(new Error('Offline asset unavailable: ' + key));
    };
    document.head.appendChild(script);
  });
  cached.set(key, promise);
  // Keep the working set bounded when browsing many motion recordings.
  while (cached.size > 8) cached.delete(cached.keys().next().value!);
  return promise;
}
export async function offlineFetch(path: string) {
  return new Response(await loadOfflineBlob(path));
}
