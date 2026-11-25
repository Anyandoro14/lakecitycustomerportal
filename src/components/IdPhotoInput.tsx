import { Camera, FileText, Upload, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ID_UPLOAD_ACCEPT, checkIdUploadMeta, sniffIdUploadMime } from "@shared/domain/uploads.ts";

interface Props {
  id: string;
  label: string;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  optional?: boolean;
}

async function validateFile(file: File): Promise<string | null> {
  const metaError = checkIdUploadMeta(file);
  if (metaError) return metaError;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (sniffIdUploadMime(head) !== file.type) return "This file doesn't look like a valid image or PDF.";
  return null;
}

/**
 * ID document capture: device camera on mobile (capture="environment"), webcam via getUserMedia on
 * desktop, or file upload. The file stays in the browser until the form is submitted.
 */
export function IdPhotoInput({ id, label, hint, value, onChange, error, optional }: Props) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const canWebcam = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!value || !value.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function accept(file: File | undefined | null) {
    if (!file) return;
    const err = await validateFile(file);
    setLocalError(err);
    onChange(err ? null : file);
  }

  const shownError = localError ?? error;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {optional && <span className="font-normal text-muted-foreground">(if applicable)</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div
        id={id}
        className={cn(
          "rounded-lg border border-dashed p-3",
          shownError ? "border-destructive bg-destructive/5" : "border-input bg-muted/40",
        )}
      >
        {value ? (
          <div className="flex items-center gap-3">
            {preview ? (
              <img src={preview} alt={`${label} preview`} className="h-16 w-24 rounded object-cover" />
            ) : (
              <span className="grid h-16 w-24 place-items-center rounded bg-white">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </span>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{value.name}</p>
              <p className="text-xs text-muted-foreground">{(value.size / 1024).toFixed(0)} KB</p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label={`Remove ${label}`}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => cameraInput.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" /> Take photo
            </Button>
            {canWebcam && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setWebcamOpen(true)} className="hidden sm:inline-flex">
                <Video className="mr-1.5 h-4 w-4" /> Use webcam
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" /> Upload image or PDF
            </Button>
          </div>
        )}
      </div>
      {shownError && <p className="text-xs font-medium text-destructive">{shownError}</p>}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept={ID_UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {webcamOpen && (
        <WebcamDialog
          onClose={() => setWebcamOpen(false)}
          onCapture={(file) => {
            setWebcamOpen(false);
            void accept(file);
          }}
        />
      )}
    </div>
  );
}

function WebcamDialog({ onClose, onCapture }: { onClose: () => void; onCapture: (f: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } })
      .then((s) => {
        active = s;
        setStream(s);
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("We couldn't access a camera. Allow camera access or upload a file instead."));
    return () => active?.getTracks().forEach((t) => t.stop());
  }, []);

  function capture() {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `id-capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
        stream?.getTracks().forEach((t) => t.stop());
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Photograph your ID</DialogTitle>
          <DialogDescription>Place the document flat in good light so all text is readable.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={video} autoPlay playsInline muted className="aspect-video w-full rounded-md bg-black object-cover" />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={capture} disabled={!stream}>Capture</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
