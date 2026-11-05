import { useRef, useState } from 'react'
import { auth, db } from '@/firebase'
import { doc, setDoc, serverTimestamp, type DocumentData } from 'firebase/firestore'
import { type User } from 'firebase/auth'

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','image/svg+xml']

export type UploadResult = {
  url: string
  publicId: string
  resourceType: string
  folder: string
  width?: number
  height?: number
  format?: string
  bytes?: number
  createdAt: any
}

type MediaMetadata = DocumentData & {
  url: string
  publicId: string
  resourceType: string
  folder: string
  userId: string
  createdAt: any
  width?: number
  height?: number
  format?: string
  bytes?: number
}

type UploadImageProps = {
  folder?: string
  onSuccess?: (result: UploadResult) => void
  onError?: (message: string) => void
}

export function UploadImage({
  folder = 'playwithnicole',
  onSuccess,
  onError,
}: UploadImageProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be under 10 MB.'
    }
    return null
  }

  const isConfigured = () => Boolean(CLOUD_NAME && UPLOAD_PRESET)

  const clearError = () => setError(null)

  const handleUpload = async () => {
    const file = selectedFile
    if (!file) return

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    const currentUser: User | null = auth.currentUser
    if (!currentUser) {
      setError('You must be signed in to upload images.')
      return
    }

    if (!isConfigured()) {
      setError('Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.')
      return
    }

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_preset', UPLOAD_PRESET)
      formData.append('folder', folder)

      const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
        throw new Error(errorData.error?.message || 'Cloudinary upload failed.')
      }

      const result = (await response.json()) as {
        secure_url: string
        public_id: string
        resource_type: string
        width?: number
        height?: number
        format?: string
        bytes?: number
      }

      setProgress(100)

      const mediaRef = doc(db, 'media', result.public_id)

      const metadata: MediaMetadata = {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: result.resource_type,
        folder,
        userId: currentUser.uid,
        createdAt: serverTimestamp(),
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      }

      await setDoc(mediaRef, metadata, { merge: true })

      const uploadResult: UploadResult = {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType: result.resource_type,
        folder,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        createdAt: metadata.createdAt,
      }

      setSelectedFile(null)
      onSuccess?.(uploadResult)
    } catch (err: any) {
      const message = err?.message || 'Upload failed. Please try again.'
      setError(message)
      onError?.(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="uploadImage" role="region" aria-label="Image upload">
      <label
        className="uploadDropZone"
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        tabIndex={0}
      >
        {uploading ? (
          `Uploading\u2026 ${progress}%`
        ) : selectedFile ? (
          `Selected: ${selectedFile.name}`
        ) : (
          'Click to select an image'
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
          style={{ display: 'none' }}
        />
      </label>

      {error && (
        <div className="uploadError" role="alert">
          {error}
          <button type="button" onClick={clearError}>Dismiss</button>
        </div>
      )}

      <button
        disabled={!selectedFile || uploading || !auth.currentUser}
        onClick={handleUpload}
        className="uploadButton"
      >
        {uploading ? 'Uploading\u2026' : !auth.currentUser ? 'Sign in to upload' : 'Upload to Cloudinary'}
      </button>
    </div>
  )
}