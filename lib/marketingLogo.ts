export const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_DATA_LENGTH = 350_000;

// Store small, self-contained PNGs so chart exports need no external image requests.
export function validatePlatformLogo(value: unknown): string | null {
   if (value === null) return null;
   if (typeof value !== "string" || value.length > MAX_LOGO_DATA_LENGTH || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Choose a valid platform logo image.");
   let bytes: Uint8Array;
   try { bytes = Uint8Array.from(atob(value.slice(22)), (character) => character.charCodeAt(0)); }
   catch { throw new Error("Choose a valid platform logo image."); }
   const signature = [137, 80, 78, 71, 13, 10, 26, 10];
   const end = [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
   if (bytes.length < 45 || signature.some((byte, index) => bytes[index] !== byte) || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR" || end.some((byte, index) => bytes[bytes.length - 12 + index] !== byte)) throw new Error("Choose a valid PNG logo.");
   const view = new DataView(bytes.buffer);
   const width = view.getUint32(16); const height = view.getUint32(20);
   if (!width || !height || width > 256 || height > 256) throw new Error("Platform logos must be at most 256 × 256 pixels after resizing.");
   return value;
}

export async function preparePlatformLogo(file: File): Promise<string> {
   if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPG, or WebP logo.");
   if (file.size > MAX_LOGO_FILE_BYTES) throw new Error("Choose a logo smaller than 2 MB.");
   const source = URL.createObjectURL(file);
   try {
      const picture = new Image();
      picture.src = source;
      try { await picture.decode(); } catch { throw new Error("This image could not be opened. Choose another logo."); }
      if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth > 8192 || picture.naturalHeight > 8192) throw new Error("Choose an image no larger than 8,192 pixels on either side.");
      const scale = Math.min(1, 256 / Math.max(picture.naturalWidth, picture.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image uploads are unavailable in this browser.");
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const logo = canvas.toDataURL("image/png");
      validatePlatformLogo(logo);
      return logo;
   } finally { URL.revokeObjectURL(source); }
}
