/**
 * Extracts a Google Drive folder or file ID from a share link or raw ID string.
 *
 * Supported inputs:
 * - Raw ID:           `abc123XYZ`
 * - Folder URL:       https://drive.google.com/drive/folders/<ID>
 * - File URL:         https://drive.google.com/file/d/<ID>/view
 * - Open URL:         https://drive.google.com/open?id=<ID>
 */
export const extractDriveId = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[\w-]{10,}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }

  const folderMatch = trimmed.match(/\/folders\/([\w-]+)/);
  if (folderMatch) return folderMatch[1];

  const fileMatch = trimmed.match(/\/file\/d\/([\w-]+)/);
  if (fileMatch) return fileMatch[1];

  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get('id');
    if (id) return id;
  } catch {
    // Not a URL — fall through.
  }

  return null;
};
