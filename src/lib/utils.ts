import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function transformGoogleDriveUrl(url: string): string {
  if (!url) return url;
  
  // Google Drive "view" or "share" links
  const driveFileRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const driveOpenRegex = /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/;
  
  const fileMatch = url.match(driveFileRegex);
  const openMatch = url.match(driveOpenRegex);
  const fileId = (fileMatch && fileMatch[1]) || (openMatch && openMatch[1]);
  
  if (fileId) {
    // Return direct image content link format using Google's image server
    // This endpoint usually has better CORS support than docs.google.com/uc
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }
  
  return url;
}
