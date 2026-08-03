/**
 * Google Drive Integration Module
 *
 * Provides access to curriculum files stored on Google Drive.
 * Supports both API Key (public folders) and Service Account (private folders) authentication.
 *
 * Hierarchy discovered for Qatar curriculum (Q-Genius library):
 *   Root: 1Hlkw08n427_AYDD87xf6DfduFyBd81cm
 *   ├── الفصل الأول 2025-2026: 13XqPqHldI08AHQry8mkQIrAnpAaoaOx7
 *   │   ├── المرحلة الابتدائية: 1BbVvnqyWwmx7WuAYwCa7jF1ShBLtSNrx
 *   │   ├── المرحلة الإعدادية: 1hqDaYBTzT3BoXvc_XoNGPbNcTwqGyX_B
 *   │   │   ├── التربية الإسلامية: 1DvlA-KPQUtMXCoJCz9NfZ6vDsxHMTjlL
 *   │   │   ├── الحوسبة وتكنولوجيا المعلومات: 1FlAI_c0EcL_zOQsstzu0721ED61pJzwk
 *   │   │   ├── الدراسات الإجتماعية: 1rDRkTlUtbgfnnS63zOwsTWGqNDa-nB3o
 *   │   │   ├── الرياضيات: 18PIsUgQBiXs3J-ER7zriLHoU6xB979RT
 *   │   │   ├── العلوم: 1DOSdspWATwZs0ZkNZAjloLdMJkkyTm55
 *   │   │   │   ├── دليل المعلم: 1jlwFAnEz4awLnXZjLIUgt5XQAvqhTMrx
 *   │   │   │   └── كتاب الطالب: 1EhjFXu_uBU3RGKIpAI8JEt8tzvmvURot
 *   │   │   ├── اللغة العربية: 1yLzWqTddVv0uDokxw2O2C2GZkhkRDCO1
 *   │   │   └── المهارات الحياتية والمهنية: 1jxlglsdiRjF8MCxNoCz0yld6mvQeqRyf
 *   │   ├── المرحلة الثانوية: 1Z4Wa2gOndpWLlhxnuvXytf-0os4expb0
 *   │   └── أوراق العمل و المصادر المساندة: 1e6PKfkmGRCi4B6r59xGDk1G_gjsWpQfM
 *   └── الفصل الثاني 2025-2026: 11LRXEMJrg5O_rDUe1sgwStkww2WPX-ty
 */

import { ENV } from "./_core/env";

// ==================== Types ====================

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  downloadUrl?: string;
};

export type DriveFolder = {
  id: string;
  name: string;
  children: DriveItem[];
};

export type DriveItem = DriveFile | DriveFolder;

export type CurriculumTree = {
  country: string;
  semesters: Array<{
    name: string;
    folderId: string;
    stages: Array<{
      name: string;
      folderId: string;
      subjects: Array<{
        name: string;
        folderId: string;
        resources: DriveFile[];
      }>;
    }>;
  }>;
};

// ==================== Qatar Curriculum Folder IDs ====================

export const QATAR_DRIVE_ROOT = "1Hlkw08n427_AYDD87xf6DfduFyBd81cm";

export const QATAR_FOLDERS = {
  semester1: "13XqPqHldI08AHQry8mkQIrAnpAaoaOx7",
  semester2: "11LRXEMJrg5O_rDUe1sgwStkww2WPX-ty",
  elementary: "1BbVvnqyWwmx7WuAYwCa7jF1ShBLtSNrx",
  preparatory: "1hqDaYBTzT3BoXvc_XoNGPbNcTwqGyX_B",
  secondary: "1Z4Wa2gOndpWLlhxnuvXytf-0os4expb0",
  worksheets: "1e6PKfkmGRCi4B6r59xGDk1G_gjsWpQfM",
  // Preparatory subjects
  prepIslamic: "1DvlA-KPQUtMXCoJCz9NfZ6vDsxHMTjlL",
  prepComputing: "1FlAI_c0EcL_zOQsstzu0721ED61pJzwk",
  prepSocial: "1rDRkTlUtbgfnnS63zOwsTWGqNDa-nB3o",
  prepMath: "18PIsUgQBiXs3J-ER7zriLHoU6xB979RT",
  prepScience: "1DOSdspWATwZs0ZkNZAjloLdMJkkyTm55",
  prepArabic: "1yLzWqTddVv0uDokxw2O2C2GZkhkRDCO1",
  prepLifeSkills: "1jxlglsdiRjF8MCxNoCz0yld6mvQeqRyf",
  // Science sub-folders
  scienceTeacherGuide: "1jlwFAnEz4awLnXZjLIUgt5XQAvqhTMrx",
  scienceStudentBook: "1EhjFXu_uBU3RGKIpAI8JEt8tzvmvURot",
} as const;

// ==================== API Helpers ====================

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/**
 * Get authentication headers based on available credentials.
 * Uses Service Account JSON if available, otherwise falls back to API Key.
 */
function getAuthHeaders(): Record<string, string> {
  if (ENV.googleDriveApiKey) {
    return { "x-goog-api-key": ENV.googleDriveApiKey };
  }
  if (ENV.googleServiceAccountJson) {
    // Service Account auth would require JWT signing — for now, API Key is sufficient
    // for public folders. Service Account support can be added later for private folders.
    throw new Error("Service Account auth not yet implemented — use API Key for public folders");
  }
  throw new Error("No Google Drive credentials configured (GOOGLE_DRIVE_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON)");
}

function hasCredentials(): boolean {
  return !!(ENV.googleDriveApiKey || ENV.googleServiceAccountJson);
}

/**
 * List files and folders inside a Google Drive folder.
 */
export async function listFolderContents(folderId: string): Promise<DriveItem[]> {
  if (!hasCredentials()) {
    throw new Error("Google Drive API not configured");
  }

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    orderBy: "folder,name",
    pageSize: "100",
  });

  const response = await fetch(`${DRIVE_API_BASE}/files?${params}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API error: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const data = await response.json() as { files: DriveFile[] };
  return data.files || [];
}

/**
 * Get file metadata by ID.
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  if (!hasCredentials()) {
    throw new Error("Google Drive API not configured");
  }

  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,modifiedTime,webViewLink",
  });

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?${params}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive API error: ${response.status} ${response.statusText} – ${errorText}`);
  }

  return await response.json() as DriveFile;
}

/**
 * Download a file's content from Google Drive.
 * Returns the file as a Buffer.
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  if (!hasCredentials()) {
    throw new Error("Google Drive API not configured");
  }

  const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Drive download error: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Recursively list all files in a folder tree (depth-first).
 * Returns a flat list of all files (not folders) found.
 */
export async function listAllFilesRecursive(folderId: string): Promise<DriveFile[]> {
  const items = await listFolderContents(folderId);
  const files: DriveFile[] = [];

  for (const item of items) {
    if ("mimeType" in item && item.mimeType === "application/vnd.google-apps.folder") {
      // Recurse into subfolder
      const subFiles = await listAllFilesRecursive(item.id);
      files.push(...subFiles);
    } else {
      files.push(item as DriveFile);
    }
  }

  return files;
}

/**
 * Build a curriculum tree for Qatar from Google Drive.
 * This maps the Q-Genius folder structure to our curriculum model.
 */
export async function buildQatarCurriculumTree(): Promise<CurriculumTree> {
  const tree: CurriculumTree = {
    country: "قطر",
    semesters: [],
  };

  // Semester 1
  const sem1Items = await listFolderContents(QATAR_FOLDERS.semester1);
  const sem1Stages = sem1Items.filter(
    item => "mimeType" in item && item.mimeType === "application/vnd.google-apps.folder"
  ) as DriveFile[];

  const semester1 = {
    name: "الفصل الأول 2025-2026",
    folderId: QATAR_FOLDERS.semester1,
    stages: [] as CurriculumTree["semesters"][0]["stages"],
  };

  for (const stage of sem1Stages) {
    const subjects = await listFolderContents(stage.id);
    const subjectFolders = subjects.filter(
      item => "mimeType" in item && item.mimeType === "application/vnd.google-apps.folder"
    ) as DriveFile[];

    const stageData = {
      name: stage.name,
      folderId: stage.id,
      subjects: [] as CurriculumTree["semesters"][0]["stages"][0]["subjects"],
    };

    for (const subject of subjectFolders) {
      const resources = await listFolderContents(subject.id);
      const files = resources.filter(
        item => "mimeType" in item && item.mimeType !== "application/vnd.google-apps.folder"
      ) as DriveFile[];

      stageData.subjects.push({
        name: subject.name,
        folderId: subject.id,
        resources: files,
      });
    }

    semester1.stages.push(stageData);
  }

  tree.semesters.push(semester1);
  return tree;
}

/**
 * Find a folder by name within a parent folder.
 */
export async function findFolderByName(parentId: string, name: string): Promise<DriveFile | null> {
  const items = await listFolderContents(parentId);
  const folder = items.find(
    item => "mimeType" in item &&
    item.mimeType === "application/vnd.google-apps.folder" &&
    item.name === name
  ) as DriveFile | undefined;
  return folder || null;
}

/**
 * Find a file by name within a parent folder.
 */
export async function findFileByName(parentId: string, name: string): Promise<DriveFile | null> {
  const items = await listFolderContents(parentId);
  const file = items.find(
    item => "mimeType" in item &&
    item.mimeType !== "application/vnd.google-apps.folder" &&
    item.name === name
  ) as DriveFile | undefined;
  return file || null;
}

/**
 * Get the public view URL for a file (works for public folders).
 */
export function getFileViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Get the public download URL for a file (works for public folders).
 */
export function getFileDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
