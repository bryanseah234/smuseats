import { useCallback, useRef, useState } from 'react';

export type FloorplanAsset = {
  name: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
};

type ImageUploaderProps = {
  onUpload: (asset: FloorplanAsset) => void;
};

const ACCEPTED_TYPES = ['image/png', 'application/pdf'];

const toDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

const resolvePngSize = (dataUrl: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not load PNG for size detection.'));
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = dataUrl;
  });

const ImageUploader = ({ onUpload }: ImageUploaderProps) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const processFile = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Only PNG and PDF floorplans are supported.');
        return;
      }

      try {
        const dataUrl = await toDataUrl(file);
        const size =
          file.type === 'image/png'
            ? await resolvePngSize(dataUrl)
            : {
                width: 1000,
                height: 700,
              };

        onUpload({
          name: file.name,
          dataUrl,
          mimeType: file.type,
          width: size.width,
          height: size.height,
        });
        setError(null);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
      }
    },
    [onUpload],
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,application/pdf"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        onChange={(event) => {
          void processFile(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = '';
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          void processFile(event.dataTransfer.files?.[0] ?? null);
        }}
        style={{
          border: `2px dashed ${isDragActive ? '#f59e0b' : '#9ca3af'}`,
          borderRadius: 12,
          padding: 20,
          cursor: 'pointer',
          background: isDragActive ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>Upload floorplan (PNG/PDF)</p>
        <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
          Drag and drop here or click to choose a file.
        </p>
      </div>
      {error ? (
        <p style={{ color: '#ef4444', marginTop: 8 }} aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default ImageUploader;
