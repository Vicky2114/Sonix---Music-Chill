import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/** Upload an audio or video file. Cloudinary stores both under "video". */
export async function uploadMedia(
  filePath: string,
  publicId: string,
): Promise<{ url: string; publicId: string; bytes: number }> {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "video",
    folder: "yt-songs",
    public_id: publicId,
    overwrite: true,
  });
  return {
    url: result.secure_url,
    publicId: result.public_id,
    bytes: result.bytes,
  };
}

export { cloudinary };
