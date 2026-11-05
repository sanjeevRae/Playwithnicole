// Firebase Functions are not used on the Spark plan.
// This project uses Firebase Hosting + direct Cloudinary unsigned uploads instead.

// This file is intentionally left as a non-deployed placeholder.
// firebase-admin, express, and cloudinary are NOT installed in this workspace
// (there is no functions/package.json), so the handlers below are commented out.

// To enable Cloud Functions later:
//   1. cd functions && npm init -y
//   2. npm install firebase-admin express cloudinary
//   3. Add a functions/tsconfig.json and wire up firebase.json
//   4. Uncomment and implement the handlers below.

// Example (disabled):
//
// import * as admin from 'firebase-admin';
// import * as express from 'express';
// import { v2 as cloudinary } from 'cloudinary';
//
// const app = express();
// app.use(express.json());
//
// app.post('/api/upload', async (req, res) => {
//   try {
//     const { path, folder = 'playwithnicole' } = req.body as { path: string; folder?: string };
//     const result = await cloudinary.uploader.upload(path, { folder, resource_type: 'auto' });
//     res.json({ success: true, url: result.secure_url, public_id: result.public_id });
//   } catch (error: any) {
//     console.error('Cloudinary upload error:', error);
//     res.status(500).json({ error: error.message || 'Upload failed' });
//   }
// );
//
// export const uploadMedia = admin.https.onRequest(app);

