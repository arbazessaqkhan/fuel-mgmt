/**
 * Compresses an image blob on an off-screen HTML5 canvas to <= 1600px and JPEG quality 0.85
 * to keep camera uploads fast (< 300 KB) and lightweight over the network.
 */
export async function compressImage(blob: Blob): Promise<Blob> {
  if (typeof window === "undefined" || blob.size <= 350 * 1024) return blob;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const MAX = 1600;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(blob);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => resolve(b || blob), "image/jpeg", 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
