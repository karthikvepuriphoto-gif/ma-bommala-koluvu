/** Replace this one line if the OAuth Web Client ID ever changes. */
export const GOOGLE_CLIENT_ID =
  "530224183851-8gp2uth9coig5tseijcipvr60a5ksnam.apps.googleusercontent.com";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

/** Requested at sign-in. YouTube is requested later, only if a film is uploaded. */
export const BASE_SCOPES = ["openid", "email", "profile", DRIVE_SCOPE];

export const FOLDER_ROOT = "Ma Bommala Koluvu";
export const FOLDER_PHOTOS = "Photos";
export const FOLDER_VOICE = "Voice notes";
export const FOLDER_FILMS = "Films";
export const CATALOG_NAME = "catalog.json";

export function isGoogleConfigured(id: string = GOOGLE_CLIENT_ID): boolean {
  const trimmed = id.trim();
  if (trimmed.length < 20) return false;
  if (trimmed.includes("YOUR_GOOGLE_CLIENT_ID")) return false;
  return true;
}
