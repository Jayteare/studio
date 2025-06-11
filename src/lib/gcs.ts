
'use server';

import { Storage } from '@google-cloud/storage';

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;

if (!projectId) {
  throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set.');
}
if (!bucketName) {
  throw new Error('GOOGLE_CLOUD_BUCKET_NAME environment variable is not set.');
}

// If GOOGLE_APPLICATION_CREDENTIALS is set in .env, it will be used automatically.
// Otherwise, if running on GCP (like App Hosting), default credentials might be used.
const storage = new Storage({
  projectId: projectId,
});

/**
 * Uploads a file buffer to Google Cloud Storage.
 * @param fileBuffer The file content as a Buffer.
 * @param destinationPath The desired path and filename in GCS (e.g., 'invoices/user123/invoice.pdf').
 * @param contentType The MIME type of the file (e.g., 'application/pdf').
 * @returns The GCS URI of the uploaded file (e.g., 'gs://<bucket-name>/<file-path>').
 */
export async function uploadFileToGCS(
  fileBuffer: Buffer,
  destinationPath: string,
  contentType: string
): Promise<string> {
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationPath);

    await file.save(fileBuffer, {
      metadata: {
        contentType: contentType,
      },
      // To make the file publicly readable, you might set predefinedAcl: 'publicRead'
      // However, this depends on your security requirements.
      // For signed URLs or more granular control, omit this or set appropriately.
      // predefinedAcl: 'publicRead', // Example: make public
    });

    console.log(`Successfully uploaded ${destinationPath} to GCS bucket ${bucketName}.`);
    return `gs://${bucketName}/${destinationPath}`;
  } catch (error) {
    console.error(`Failed to upload file to GCS: ${destinationPath}`, error);
    throw new Error(`GCS Upload Error: Could not upload file. ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Optional: Function to generate a publicly accessible URL if files are public
// export async function getPublicUrl(gcsUri: string): Promise<string> {
//   const [bucket, ...filePathParts] = gcsUri.replace('gs://', '').split('/');
//   const filePath = filePathParts.join('/');
//   return `https://storage.googleapis.com/${bucket}/${filePath}`;
// }
