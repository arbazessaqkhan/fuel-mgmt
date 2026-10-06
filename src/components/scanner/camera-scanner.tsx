"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Camera,
  RefreshCw,
  X,
  AlertCircle,
  Sparkles,
  FlipHorizontal,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CameraScannerProps {
  onCapture: (file: File) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

export function CameraScanner({
  onCapture,
  onCancel,
  disabled,
  className,
}: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const [starting, setStarting] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (mode: "environment" | "user") => {
      stopStream();
      setStarting(true);
      setError(null);

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("Camera access is not supported by this browser. Use photo upload instead.");
        setStarting(false);
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Check if device has multiple cameras (e.g. mobile front/back)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          setHasMultipleCameras(videoDevices.length > 1);
        } catch {}

        setStarting(false);
      } catch (err: unknown) {
        console.error("Camera access failed", err);
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Camera permission was denied. Please allow camera access in your browser settings, or use the camera photo picker below.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setError("No camera was found on your device.");
        } else {
          setError("Unable to start the camera stream. You can capture using your phone/system camera below.");
        }
        setStarting(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopStream();
    };
  }, [facingMode, startCamera, stopStream]);

  const switchCamera = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
  };

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || capturing) return;

    setCapturing(true);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        toast.error("Could not capture photo.");
        setCapturing(false);
        return;
      }

      // If using user-facing camera, un-mirror
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            toast.error("Failed to process captured image.");
            setCapturing(false);
            return;
          }

          const file = new File([blob], `voucher-camera-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });

          stopStream();
          toast.success("Voucher captured", {
            description: "Running AI vision & field extraction…",
          });
          onCapture(file);
        },
        "image/jpeg",
        0.92
      );
    } catch (e) {
      console.error("Capture failed", e);
      toast.error("Failed to capture image.");
      setCapturing(false);
    }
  }, [capturing, facingMode, onCapture, stopStream]);

  // Fallback for native mobile camera picker
  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopStream();
      onCapture(file);
    }
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/80 bg-neutral-950 text-white shadow-xl",
        className
      )}
    >
      {/* Video Viewport Container: generous portrait height so users do not need to pull phone high */}
      <div className="relative h-[55vh] min-h-[460px] max-h-[640px] w-full overflow-hidden bg-black sm:min-h-[500px]">
        {/* Live video */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            facingMode === "user" && "-scale-x-100",
            starting || error ? "opacity-0" : "opacity-100"
          )}
        />

        {/* Viewfinder Overlay / Voucher Target Frame */}
        {!starting && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 sm:p-6">
            <div className="relative h-[86%] w-[92%] max-w-sm sm:max-w-lg rounded-xl border border-white/30 bg-white/[0.02] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              {/* Corner Reticles */}
              <div className="absolute -left-1 -top-1 h-6 w-6 border-l-4 border-t-4 border-primary rounded-tl-sm" />
              <div className="absolute -right-1 -top-1 h-6 w-6 border-r-4 border-t-4 border-primary rounded-tr-sm" />
              <div className="absolute -bottom-1 -left-1 h-6 w-6 border-b-4 border-l-4 border-primary rounded-bl-sm" />
              <div className="absolute -bottom-1 -right-1 h-6 w-6 border-b-4 border-r-4 border-primary rounded-br-sm" />

              {/* Laser Scanning Animation Beam */}
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_8px_#3b82f6] animate-scanline" />

              {/* Instruction pill */}
              <div className="absolute bottom-3 inset-x-0 mx-auto flex w-max items-center gap-1.5 rounded-full bg-black/75 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm border border-white/10">
                <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                Align fuel voucher inside frame
              </div>
            </div>
          </div>
        )}

        {/* Starting / Loading Overlay */}
        {starting && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/90 text-center p-4">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-neutral-200">Starting camera…</p>
            <p className="text-xs text-neutral-400">Please grant camera permissions if prompted.</p>
          </div>
        )}

        {/* Error / Permission Denied Overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/95 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="max-w-md text-sm font-medium text-neutral-200">{error}</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => startCamera(facingMode)}
                className="bg-white/10 text-white hover:bg-white/20 border-white/20"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry Camera
              </Button>
              <Button
                size="sm"
                onClick={() => fallbackInputRef.current?.click()}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                <Camera className="mr-2 h-3.5 w-3.5" /> Take Photo
              </Button>
            </div>
          </div>
        )}

        {/* Hidden Fallback Camera File Input */}
        <input
          ref={fallbackInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFallbackFile}
        />

        {/* Top Control Bar */}
        <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold backdrop-blur-md border border-white/10">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            VOUCHER SCANNER
          </div>

          <div className="flex items-center gap-1.5">
            {hasMultipleCameras && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={switchCamera}
                disabled={starting || Boolean(error)}
                className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md border border-white/10"
                title="Switch Camera"
              >
                <FlipHorizontal className="h-4 w-4" />
              </Button>
            )}

            {onCancel && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => {
                  stopStream();
                  onCancel();
                }}
                className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md border border-white/10"
                title="Close Scanner"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Shutter & Action Bar */}
      <div className="flex items-center justify-between gap-1 bg-neutral-900/90 px-3 py-3 sm:px-6 sm:py-4 backdrop-blur-md border-t border-white/10">
        <div className="flex items-center min-w-0">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                stopStream();
                onCancel();
              }}
              className="text-[11px] sm:text-xs text-neutral-300 hover:text-white hover:bg-white/10 px-2 sm:px-3 h-8 sm:h-9"
            >
              <Upload className="mr-1 h-3 w-3 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">Upload File</span>
              <span className="sm:hidden">Upload</span>
            </Button>
          )}
        </div>

        {/* Capture / Shutter Button */}
        <div className="flex items-center justify-center shrink-0">
          <button
            type="button"
            onClick={handleCapture}
            disabled={starting || Boolean(error) || capturing || disabled}
            aria-label="Capture voucher photo"
            className={cn(
              "group relative flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full border-4 border-white/90 bg-primary shadow-lg transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50",
              capturing ? "animate-pulse scale-95" : "hover:scale-105 hover:bg-primary/90"
            )}
          >
            <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-full bg-white transition-transform group-hover:scale-95 flex items-center justify-center text-primary shadow-inner">
              <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </button>
        </div>

        {/* Quick mobile snapshot button */}
        <div className="flex items-center min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fallbackInputRef.current?.click()}
            className="text-[11px] sm:text-xs text-neutral-300 hover:text-white hover:bg-white/10 px-2 sm:px-3 h-8 sm:h-9"
            title="Snap with phone camera"
          >
            <Camera className="mr-1 h-3 w-3 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Snap Photo</span>
            <span className="sm:hidden">Photo</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
