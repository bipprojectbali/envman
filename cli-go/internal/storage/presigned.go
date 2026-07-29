package storage

import (
	"io"
)

// PutPresigned uploads a stream to a presigned PUT URL.
//
// Exported so other packages (notably internal/transfer) can reuse the upload
// path instead of copying it: putToMinio carries the proxy-error translation
// that turns Cloudflare's HTML 413 page into an actionable message about
// MINIO_PRESIGN_BASE_URL, which took real debugging to get right.
//
// mimeType must match the value the server signed the URL with, or MinIO
// rejects the PUT with an opaque 403.
func PutPresigned(uploadURL string, r io.Reader, size int64, mimeType string, onProgress ProgressFunc) error {
	return putToMinio(uploadURL, r, size, mimeType, onProgress)
}

// NewProgressReader wraps a reader so downloads elsewhere can report progress
// with the same accounting as uploads.
func NewProgressReader(r io.Reader, total int64, fn ProgressFunc) io.Reader {
	return newProgressReader(r, total, fn)
}
