import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Mic,
  MicOff,
  Volume2,
  CheckCircle2,
  XCircle,
  User,
  Mail,
  Phone,
  RefreshCw,
  Clock,
  GraduationCap,
  Users,
  Camera,
  VideoOff,
  ShieldCheck,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

type RawAnswer = {
  question: string;
  answer: string;
};

type SubjectInfo = {
  name: string;
  slug: string;
  modules: { title: string; topics: string[] }[];
  allowedEmails?: string[];
};

const MAX_RECORDING_MS = 45000;

export default function VivaPage() {
  const [, params] = useRoute("/:subject");
  const subject = params?.subject || "";

  const sessionKey = `viva_${subject}`;

  const [step, setStepRaw] = useState<
    "register" | "permissions" | "preparing" | "exam" | "completed" | "expired"
  >(() => {
    try {
      const saved = sessionStorage.getItem(`${sessionKey}_step`);
      if (saved === "exam" || saved === "preparing") return saved;
    } catch {}
    return "register";
  });
  const setStep = useCallback(
    (
      newStep:
        | "register"
        | "permissions"
        | "preparing"
        | "exam"
        | "completed"
        | "expired",
    ) => {
      setStepRaw(newStep);
      try {
        sessionStorage.setItem(`${sessionKey}_step`, newStep);
      } catch {}
    },
    [sessionKey],
  );

  const [studentInfo, setStudentInfo] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`${sessionKey}_student`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { name: "", email: "", phone: "", rollNumber: "", studentClass: "", division: "" };
  });
  const updateStudentInfo = useCallback(
    (info: typeof studentInfo) => {
      setStudentInfo(info);
      try {
        sessionStorage.setItem(`${sessionKey}_student`, JSON.stringify(info));
      } catch {}
    },
    [sessionKey],
  );

  const [isStarting, setIsStarting] = useState(false);
  const [attemptLimitReached, setAttemptLimitReached] = useState(false);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [micGranted, setMicGranted] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [micError, setMicError] = useState("");
  const [isRequestingCamera, setIsRequestingCamera] = useState(false);
  const [isRequestingMic, setIsRequestingMic] = useState(false);

  const [questions, setQuestions] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem(`${sessionKey}_questions`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`${sessionKey}_qIndex`);
      if (saved) return parseInt(saved, 10);
    } catch {}
    return 0;
  });
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [answerLocked, setAnswerLocked] = useState(false);
  const [micAttempts, setMicAttempts] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [hasRecorded, setHasRecorded] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    try {
      if (questions.length > 0)
        sessionStorage.setItem(
          `${sessionKey}_questions`,
          JSON.stringify(questions),
        );
    } catch {}
  }, [questions, sessionKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${sessionKey}_qIndex`,
        String(currentQuestionIndex),
      );
    } catch {}
  }, [currentQuestionIndex, sessionKey]);

  useEffect(() => {
    if ((step === "exam" || step === "preparing") && questions.length > 0) {
      setStepRaw("exam");
    } else if (step === "preparing" && questions.length === 0) {
      setStepRaw("register");
      try {
        sessionStorage.removeItem(`${sessionKey}_step`);
      } catch {}
    }
  }, []);

  const rawAnswersRef = useRef<RawAnswer[]>([]);
  const vivaResultIdRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoListenRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentAnswerRef = useRef<string>("");
  const isProcessingRef = useRef<boolean>(false);
  const questionsRef = useRef<string[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const studentInfoRef = useRef(studentInfo);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const photoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const capturedPhotoRef = useRef<string | null>(null);

  useEffect(() => {
    currentAnswerRef.current = currentAnswer;
  }, [currentAnswer]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    studentInfoRef.current = studentInfo;
  }, [studentInfo]);

  const [subjectDeactivated, setSubjectDeactivated] = useState(false);

  const { data: subjectInfo, isLoading: subjectLoading } = useQuery<SubjectInfo | null>({
    queryKey: ["subject", subject],
    queryFn: async () => {
      const response = await fetch(`/api/subjects/${subject}`);
      if (response.status === 403) {
        setSubjectDeactivated(true);
        return null;
      }
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!subject,
  });

  const generateQuestionsMutation = useMutation({
    mutationFn: async (subject: string) => {
      const response = await fetch("/api/viva/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, count: 5 }),
      });
      if (!response.ok) throw new Error("Failed to generate questions");
      return response.json();
    },
  });

  const submitFastMutation = useMutation({
    mutationFn: async (data: {
      studentName: string;
      studentEmail: string;
      studentPhone: string;
      studentRollNumber?: string;
      studentClass?: string;
      studentDivision?: string;
      subject: string;
      rawAnswers: RawAnswer[];
      resultId?: number | null;
    }) => {
      const response = await fetch("/api/viva/submit-fast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to submit");
      return response.json();
    },
  });

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  const stopCamera = useCallback(() => {
    if (photoTimerRef.current) {
      clearTimeout(photoTimerRef.current);
      photoTimerRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    cameraVideoRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
        audio: false,
      });
      cameraStreamRef.current = stream;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      cameraVideoRef.current = video;
      await video.play();
      const delay = Math.floor(Math.random() * 60000) + 20000;
      photoTimerRef.current = setTimeout(() => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext("2d");
          if (ctx && video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, 320, 240);
            capturedPhotoRef.current = canvas.toDataURL("image/jpeg", 0.6);
          }
        } catch {}
      }, delay);
    } catch {
      // Camera unavailable or denied — silently skip
    }
  }, []);

  const submitExam = useCallback(async () => {
    try {
      const result = await submitFastMutation.mutateAsync({
        studentName: studentInfo.name,
        studentEmail: studentInfo.email,
        studentPhone: studentInfo.phone,
        studentRollNumber: studentInfo.rollNumber,
        studentClass: studentInfo.studentClass,
        studentDivision: studentInfo.division,
        subject,
        rawAnswers: rawAnswersRef.current,
        resultId: vivaResultIdRef.current,
      });
      stopCamera();
      if (capturedPhotoRef.current && result?.id) {
        try {
          await fetch("/api/viva/upload-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: result.id, photo: capturedPhotoRef.current }),
          });
        } catch {}
      }
      try {
        sessionStorage.removeItem(`${sessionKey}_step`);
        sessionStorage.removeItem(`${sessionKey}_student`);
        sessionStorage.removeItem(`${sessionKey}_questions`);
        sessionStorage.removeItem(`${sessionKey}_qIndex`);
      } catch {}
      setStep("completed");
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("Failed to submit. Please try again.");
    }
  }, [studentInfo, subject, submitFastMutation, stopCamera]);

  const processAnswer = useCallback(
    async (answer: string, questionIndex: number) => {
      if (isProcessingRef.current) return;

      isProcessingRef.current = true;
      setAnswerLocked(true);
      clearSilenceTimer();
      autoListenRef.current = false;

      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);

      const allQuestions = questionsRef.current;

      rawAnswersRef.current.push({
        question: allQuestions[questionIndex],
        answer: answer.trim(),
      });

      if (questionIndex < allQuestions.length - 1) {
        const nextIndex = questionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
        setCurrentAnswer("");
        setAnswerLocked(false);
        setMicAttempts(0);
        setHasRecorded(false);
        isProcessingRef.current = false;

        await speakTextAsync(allQuestions[nextIndex]);
        startListeningWithSilenceDetection();
      } else {
        isProcessingRef.current = false;
        await submitExam();
      }
    },
    [clearSilenceTimer, submitExam],
  );

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();

    setSilenceCountdown(MAX_RECORDING_MS / 1000);
    countdownIntervalRef.current = setInterval(() => {
      setSilenceCountdown((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    silenceTimerRef.current = setTimeout(() => {
      clearSilenceTimer();
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
    }, MAX_RECORDING_MS);
  }, [clearSilenceTimer]);

  const sendAudioForTranscription = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) return;
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes("mp4")
        ? "mp4"
        : audioBlob.type.includes("wav")
          ? "wav"
          : "webm";
      formData.append("audio", audioBlob, `recording.${ext}`);
      const response = await fetch("/api/viva/transcribe", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.text && data.text.trim()) {
          setCurrentAnswer(data.text.trim());
        }
      }
    } catch (e) {
      console.error("Transcription error:", e);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      stopCamera();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [clearSilenceTimer, stopCamera]);

  useEffect(() => {
    if (step !== "exam") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearSilenceTimer();
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          try {
            mediaRecorderRef.current.stop();
          } catch {}
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        // Record terminated attempt for limit tracking (fire-and-forget)
        const info = studentInfoRef.current;
        if (info?.email) {
          fetch("/api/viva/record-terminated", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentName: info.name,
              studentEmail: info.email,
              studentPhone: info.phone,
              studentRollNumber: info.rollNumber,
              studentClass: info.studentClass,
              studentDivision: info.division,
              subject,
              resultId: vivaResultIdRef.current,
            }),
          }).catch(() => {});
        }
        try {
          sessionStorage.removeItem(`${sessionKey}_step`);
          sessionStorage.removeItem(`${sessionKey}_student`);
          sessionStorage.removeItem(`${sessionKey}_questions`);
          sessionStorage.removeItem(`${sessionKey}_qIndex`);
        } catch {}
        setStep("expired");
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "Your viva is in progress. Leaving this page will end the exam.";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [step, sessionKey, clearSilenceTimer, setStep]);

  const startListeningWithSilenceDetection = useCallback(async () => {
    if (isProcessingRef.current) return;

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
    }

    setMicAttempts((prev) => prev + 1);
    setCurrentAnswer("");
    autoListenRef.current = true;

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(mediaStreamRef.current, { mimeType })
        : new MediaRecorder(mediaStreamRef.current);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        setIsListening(false);
        setHasRecorded(true);
        const blobType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        sendAudioForTranscription(audioBlob);
      };

      recorder.start();
      setIsListening(true);
      startSilenceTimer();
    } catch (e: any) {
      console.error("Mic access error:", e);
      setIsListening(false);
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        toast.error(
          "Microphone access blocked. On Android: close any floating chat bubbles or overlay apps, then tap Retry.",
          { duration: 6000 }
        );
      } else if (e?.name === "NotFoundError") {
        toast.error("No microphone found on this device.", { duration: 5000 });
      } else {
        toast.error("Could not access microphone. Please check your browser permissions.", { duration: 5000 });
      }
    }
  }, [startSilenceTimer, sendAudioForTranscription]);

  const stopListening = useCallback(() => {
    autoListenRef.current = false;
    clearSilenceTimer();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, [clearSilenceTimer]);

  const speakTextAsync = useCallback((text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      setIsSpeaking(true);
      try {
        const response = await fetch("/api/viva/text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) throw new Error("TTS failed");
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            resolve();
          };
          await audioRef.current.play();
        } else {
          setIsSpeaking(false);
          resolve();
        }
      } catch (error) {
        setIsSpeaking(false);
        resolve();
      }
    });
  }, []);

  const handleContinueToPermissions = async () => {
    if (
      !studentInfo.name ||
      !studentInfo.email ||
      !studentInfo.phone ||
      !studentInfo.rollNumber ||
      !studentInfo.studentClass ||
      !studentInfo.division
    ) {
      toast.error("Please fill in all fields");
      return;
    }
    setIsStarting(true);
    setAttemptLimitReached(false);
    try {
      const checkRes = await fetch(
        `/api/viva/check-attempts?email=${encodeURIComponent(studentInfo.email)}&subject=${encodeURIComponent(subject)}`
      );
      const checkData = await checkRes.json();
      if (checkData.limitReached) {
        setAttemptLimitReached(true);
        return;
      }
      if (subjectInfo?.allowedEmails && subjectInfo.allowedEmails.length > 0) {
        const allowed = subjectInfo.allowedEmails.map((e) => e.trim().toLowerCase());
        if (!allowed.includes(studentInfo.email.trim().toLowerCase())) {
          toast.error("Your email is not authorised to take this exam.");
          return;
        }
      }
      setCameraGranted(false);
      setMicGranted(false);
      setCameraError("");
      setMicError("");
      setStep("permissions");
    } catch (error: any) {
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  const checkPermissionState = async (name: "camera" | "microphone"): Promise<PermissionState | null> => {
    try {
      if (!navigator.permissions) return null;
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return status.state;
    } catch {
      return null;
    }
  };

  const requestCameraPermission = async () => {
    if (isRequestingCamera) return;
    setCameraError("");
    setIsRequestingCamera(true);
    try {
      const state = await checkPermissionState("camera");
      if (state === "denied") {
        setCameraGranted(false);
        setCameraError("blocked");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCameraGranted(true);
      setCameraError("");
    } catch {
      setCameraGranted(false);
      setCameraError("blocked");
    } finally {
      setIsRequestingCamera(false);
    }
  };

  const requestMicPermission = async () => {
    if (isRequestingMic) return;
    setMicError("");
    setIsRequestingMic(true);
    try {
      const state = await checkPermissionState("microphone");
      if (state === "denied") {
        setMicGranted(false);
        setMicError("blocked");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicGranted(true);
      setMicError("");
    } catch {
      setMicGranted(false);
      setMicError("blocked");
    } finally {
      setIsRequestingMic(false);
    }
  };

  useEffect(() => {
    if (step !== "permissions") return;
    let cameraStatus: PermissionStatus | null = null;
    let micStatus: PermissionStatus | null = null;
    const setupListeners = async () => {
      try {
        cameraStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
        cameraStatus.onchange = () => {
          if (cameraStatus!.state === "granted") { setCameraGranted(true); setCameraError(""); }
          else if (cameraStatus!.state === "prompt") { setCameraGranted(false); setCameraError(""); }
          else { setCameraGranted(false); setCameraError("blocked"); }
        };
        micStatus = await navigator.permissions.query({ name: "microphone" as PermissionName });
        micStatus.onchange = () => {
          if (micStatus!.state === "granted") { setMicGranted(true); setMicError(""); }
          else if (micStatus!.state === "prompt") { setMicGranted(false); setMicError(""); }
          else { setMicGranted(false); setMicError("blocked"); }
        };
      } catch {}
    };
    setupListeners();
    return () => {
      if (cameraStatus) cameraStatus.onchange = null;
      if (micStatus) micStatus.onchange = null;
    };
  }, [step]);

  const startExam = async () => {
    if (
      !studentInfo.name ||
      !studentInfo.email ||
      !studentInfo.phone ||
      !studentInfo.rollNumber ||
      !studentInfo.studentClass ||
      !studentInfo.division
    ) {
      toast.error("Please fill in all fields");
      return;
    }
    setIsStarting(true);
    setAttemptLimitReached(false);
    try {
      const checkRes = await fetch(
        `/api/viva/check-attempts?email=${encodeURIComponent(studentInfo.email)}&subject=${encodeURIComponent(subject)}`
      );
      const checkData = await checkRes.json();
      if (checkData.limitReached) {
        setAttemptLimitReached(true);
        return;
      }

      // Client-side allowed email check (server enforces this too)
      if (subjectInfo?.allowedEmails && subjectInfo.allowedEmails.length > 0) {
        const allowed = subjectInfo.allowedEmails.map((e) => e.trim().toLowerCase());
        if (!allowed.includes(studentInfo.email.trim().toLowerCase())) {
          toast.error("Your email is not authorised to take this exam.");
          setIsStarting(false);
          return;
        }
      }

      // Lock the attempt slot immediately so no parallel tab / refresh can bypass the limit
      const startRes = await fetch("/api/viva/start-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentName: studentInfo.name,
          studentEmail: studentInfo.email,
          studentPhone: studentInfo.phone,
          studentRollNumber: studentInfo.rollNumber,
          studentClass: studentInfo.studentClass,
          studentDivision: studentInfo.division,
          subject,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || "Failed to start attempt");
      vivaResultIdRef.current = startData.id;

      rawAnswersRef.current = [];
      setStep("preparing");

      const result = await generateQuestionsMutation.mutateAsync(subject);
      const questionTexts = result.questions.map((q: any) =>
        typeof q === "string" ? q : q.question,
      );
      setQuestions(questionTexts);
      setStep("exam");
      startCamera();

      if (questionTexts.length > 0) {
        try {
          await speakTextAsync(questionTexts[0]);
        } catch {}
        try {
          await startListeningWithSilenceDetection();
        } catch {}
      }
    } catch (error: any) {
      if (step === "preparing" || step === "register") {
        setStep("register");
      }
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  const manualSubmitAnswer = () => {
    processAnswer(currentAnswer, currentQuestionIndex);
  };

  const displaySubjectName = subjectInfo?.name || subject.replace(/-/g, " ");

  if (subjectLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
      </div>
    );
  }

  if (subjectDeactivated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Exam Temporarily Unavailable</h2>
          <p className="text-zinc-400 text-sm">
            This exam has been temporarily deactivated by your teacher. Please check back later or contact your teacher for more information.
          </p>
        </div>
      </div>
    );
  }

  if (!subjectInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-600/20 flex items-center justify-center">
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Subject Not Found</h2>
          <p className="text-zinc-400 text-sm">
            This exam link is no longer active or the subject has been removed. Please contact your teacher for the correct link.
          </p>
        </div>
      </div>
    );
  }

  if (step === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <Card
          className="w-full max-w-lg bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur"
          data-testid="card-registration"
        >
          <CardHeader className="text-center pb-2 px-4 sm:px-6">
            <img
              src="/leapup-logo.png"
              alt="LeapUp"
              className="h-7 mx-auto mb-3"
              data-testid="img-leapup-logo"
            />
            <CardTitle
              className="text-2xl sm:text-3xl font-bold text-white"
              data-testid="heading-viva-title"
            >
              AI Mock Viva
            </CardTitle>
            <CardDescription>
              <Badge
                variant="outline"
                className="text-sm sm:text-base px-3 sm:px-4 py-1 capitalize border-violet-500 text-violet-400"
                data-testid="badge-subject"
              >
                {displaySubjectName}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-5 px-4 sm:px-6">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label
                  htmlFor="name"
                  className="text-zinc-300 flex items-center gap-2 text-sm"
                >
                  <User className="h-3.5 w-3.5" /> Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your name"
                  value={studentInfo.name}
                  onChange={(e) =>
                    updateStudentInfo({ ...studentInfo, name: e.target.value })
                  }
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 text-base"
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="email"
                  className="text-zinc-300 flex items-center gap-2 text-sm"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={studentInfo.email}
                  onChange={(e) =>
                    updateStudentInfo({ ...studentInfo, email: e.target.value })
                  }
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 text-base"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="phone"
                  className="text-zinc-300 flex items-center gap-2 text-sm"
                >
                  <Phone className="h-3.5 w-3.5" /> Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone"
                  value={studentInfo.phone}
                  onChange={(e) =>
                    updateStudentInfo({ ...studentInfo, phone: e.target.value })
                  }
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 text-base"
                  data-testid="input-phone"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="rollNumber"
                  className="text-zinc-300 flex items-center gap-2 text-sm"
                >
                  <GraduationCap className="h-3.5 w-3.5" /> Roll Number
                </Label>
                <Input
                  id="rollNumber"
                  placeholder="Enter your roll number"
                  value={studentInfo.rollNumber}
                  onChange={(e) =>
                    updateStudentInfo({ ...studentInfo, rollNumber: e.target.value })
                  }
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 text-base"
                  data-testid="input-roll-number"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label
                    htmlFor="studentClass"
                    className="text-zinc-300 flex items-center gap-2 text-sm"
                  >
                    <GraduationCap className="h-3.5 w-3.5" /> Class
                  </Label>
                  <Input
                    id="studentClass"
                    placeholder="e.g., FY BMS"
                    value={studentInfo.studentClass}
                    onChange={(e) =>
                      updateStudentInfo({
                        ...studentInfo,
                        studentClass: e.target.value,
                      })
                    }
                    className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 text-base"
                    data-testid="input-class"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="division"
                    className="text-zinc-300 flex items-center gap-2 text-sm"
                  >
                    <Users className="h-3.5 w-3.5" /> Division
                  </Label>
                  <Input
                    id="division"
                    placeholder="e.g., A"
                    value={studentInfo.division}
                    onChange={(e) =>
                      updateStudentInfo({
                        ...studentInfo,
                        division: e.target.value,
                      })
                    }
                    className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 h-11 text-base"
                    data-testid="input-division"
                  />
                </div>
              </div>
            </div>
            <div
              className="bg-zinc-700/40 border border-zinc-600 rounded-lg p-3 sm:p-4 space-y-2"
              data-testid="instructions-panel"
            >
              <p className="text-sm font-semibold text-violet-400">
                Instructions:
              </p>
              <ol className="text-xs sm:text-sm text-zinc-300 space-y-1.5 list-decimal list-outside pl-4">
                <li>It is compulsory to allow access to camera and microphone, if denied any access, the viva marks will not be considered.</li>
                <li>
                  Do not switch tabs or navigate away — the viva will end
                  automatically if you leave this page.
                </li>
                <li>
                  Make sure there is no background noise, in case of any noise
                  interruption the Viva will stop.
                </li>
                <li>
                  Viva has to be given in English, any other language will not
                  be evaluated.
                </li>
                <li>
                  Answer in detail, elaborate to get better marks. (1 word
                  answers will not get any marks)
                </li>
                <li>
                  Tap on the "Stop" button to stop recording your answer then
                  Click "Next" to proceed to the next question.
                </li>
              </ol>
            </div>
            {attemptLimitReached && (
              <div
                className="rounded-lg border border-red-600/50 bg-red-600/10 px-4 py-3 text-center space-y-1"
                data-testid="alert-attempt-limit"
              >
                <p className="text-red-400 font-bold text-sm">
                  Attempt limit reached
                </p>
                <p className="text-red-300 text-xs">
                  You have already attempted this subject's viva. No further attempts are allowed.
                </p>
              </div>
            )}
            <Button
              onClick={handleContinueToPermissions}
              className="w-full h-12 text-base bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
              disabled={isStarting || attemptLimitReached}
              data-testid="button-continue-permissions"
            >
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "permissions") {
    const bothGranted = cameraGranted && micGranted;
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <Card className="w-full max-w-md bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur" data-testid="card-permissions">
          <CardHeader className="text-center pb-2 px-4 sm:px-6">
            <img src="/leapup-logo.png" alt="LeapUp" className="h-7 mx-auto mb-3" />
            <div className="mx-auto w-14 h-14 rounded-full bg-violet-500/20 flex items-center justify-center mb-2">
              <ShieldCheck className="h-7 w-7 text-violet-400" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold text-white">Device Permissions</CardTitle>
            <p className="text-zinc-400 text-sm mt-1">
              Allow camera and microphone access to start your viva
            </p>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6 pb-6">
            <div className="space-y-3">
              <button
                onClick={() => { if (!cameraGranted) requestCameraPermission(); else setCameraGranted(false); }}
                disabled={isRequestingCamera}
                data-testid="row-camera-permission"
                className={`w-full flex items-center justify-between rounded-xl border p-4 transition-all text-left ${
                  cameraGranted
                    ? "border-green-500/50 bg-green-500/10"
                    : cameraError
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-zinc-600 bg-zinc-700/40 hover:border-zinc-500"
                } ${isRequestingCamera ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    cameraGranted ? "bg-green-500/20" : cameraError ? "bg-red-500/20" : "bg-zinc-600/50"
                  }`}>
                    {isRequestingCamera
                      ? <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
                      : cameraGranted
                      ? <Camera className="h-5 w-5 text-green-400" />
                      : <VideoOff className={`h-5 w-5 ${cameraError ? "text-red-400" : "text-zinc-400"}`} />}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Camera Access</p>
                    <p className={`text-xs ${cameraGranted ? "text-green-400" : cameraError ? "text-red-400" : "text-zinc-400"}`}>
                      {isRequestingCamera ? "Waiting for permission..." : cameraGranted ? "Access granted" : cameraError ? "Blocked — see instructions below" : "Tap to allow camera access"}
                    </p>
                  </div>
                </div>
                <div className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${cameraGranted ? "bg-green-500" : cameraError ? "bg-red-500/50" : "bg-zinc-600"}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${cameraGranted ? "translate-x-6" : "translate-x-1"}`} />
                </div>
              </button>
              {cameraError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1" data-testid="error-camera">
                  <p className="text-xs font-semibold text-red-400">Camera is blocked by your browser</p>
                  <p className="text-xs text-red-300">
                    On Chrome: tap the <strong>lock icon</strong> (or <strong>camera icon</strong>) in the address bar → tap <strong>Camera</strong> → change to <strong>Allow</strong> → refresh this page.
                  </p>
                  <p className="text-xs text-red-300">
                    On Safari: go to <strong>Settings → Safari → Camera</strong> → set to <strong>Allow</strong> → come back here.
                  </p>
                </div>
              )}

              <button
                onClick={() => { if (!micGranted) requestMicPermission(); else setMicGranted(false); }}
                disabled={isRequestingMic}
                data-testid="row-mic-permission"
                className={`w-full flex items-center justify-between rounded-xl border p-4 transition-all text-left ${
                  micGranted
                    ? "border-green-500/50 bg-green-500/10"
                    : micError
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-zinc-600 bg-zinc-700/40 hover:border-zinc-500"
                } ${isRequestingMic ? "opacity-70 cursor-wait" : "cursor-pointer"}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    micGranted ? "bg-green-500/20" : micError ? "bg-red-500/20" : "bg-zinc-600/50"
                  }`}>
                    {isRequestingMic
                      ? <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
                      : micGranted
                      ? <Mic className="h-5 w-5 text-green-400" />
                      : <MicOff className={`h-5 w-5 ${micError ? "text-red-400" : "text-zinc-400"}`} />}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Microphone Access</p>
                    <p className={`text-xs ${micGranted ? "text-green-400" : micError ? "text-red-400" : "text-zinc-400"}`}>
                      {isRequestingMic ? "Waiting for permission..." : micGranted ? "Access granted" : micError ? "Blocked — see instructions below" : "Tap to allow microphone access"}
                    </p>
                  </div>
                </div>
                <div className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${micGranted ? "bg-green-500" : micError ? "bg-red-500/50" : "bg-zinc-600"}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${micGranted ? "translate-x-6" : "translate-x-1"}`} />
                </div>
              </button>
              {micError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 space-y-1" data-testid="error-mic">
                  <p className="text-xs font-semibold text-red-400">Microphone is blocked by your browser</p>
                  <p className="text-xs text-red-300">
                    On Chrome: tap the <strong>lock icon</strong> (or <strong>mic icon</strong>) in the address bar → tap <strong>Microphone</strong> → change to <strong>Allow</strong> → refresh this page.
                  </p>
                  <p className="text-xs text-red-300">
                    On Safari: go to <strong>Settings → Safari → Microphone</strong> → set to <strong>Allow</strong> → come back here.
                  </p>
                </div>
              )}
            </div>

            {!bothGranted && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center">
                <p className="text-amber-400 text-xs font-medium">
                  Both camera and microphone must be enabled to proceed
                </p>
              </div>
            )}

            <Button
              onClick={startExam}
              disabled={!bothGranted || isStarting}
              className="w-full h-12 text-base bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              data-testid="button-start-exam"
            >
              {isStarting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</>
              ) : (
                "Start Viva"
              )}
            </Button>

            <button
              onClick={() => setStep("register")}
              className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              data-testid="button-back-register"
            >
              ← Back to registration
            </button>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "preparing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-violet-500 mb-3" />
          <p className="text-base sm:text-lg text-white font-medium">
            Preparing questions...
          </p>
          <p className="text-sm text-zinc-400">{displaySubjectName}</p>
        </div>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "exam") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-3 py-4 sm:p-4">
        <div className="container mx-auto max-w-3xl">
          <div className="mb-3 sm:mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm sm:text-base font-semibold text-white">
                Question {currentQuestionIndex + 1}{" "}
                <span className="text-zinc-400 font-normal">
                  of {questions.length}
                </span>
              </span>
              <Badge
                variant="outline"
                className="text-xs border-zinc-600 text-zinc-400 max-w-[140px] sm:max-w-none truncate"
              >
                {displaySubjectName}
              </Badge>
            </div>
            <Progress
              value={((currentQuestionIndex + 1) / questions.length) * 100}
              className="h-2 bg-zinc-700"
            />
          </div>

          <Card
            className="bg-zinc-800/80 border-zinc-700 shadow-xl backdrop-blur"
            data-testid="card-question"
          >
            <CardHeader className="pb-3 px-4 sm:px-6">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div
                  className={`p-2 sm:p-2.5 rounded-full shrink-0 ${isSpeaking ? "bg-violet-600 animate-pulse" : "bg-zinc-700"}`}
                >
                  <Volume2
                    className={`h-4 w-4 sm:h-5 sm:w-5 ${isSpeaking ? "text-white" : "text-zinc-400"}`}
                  />
                </div>
                <CardTitle
                  className="text-base sm:text-lg text-white font-medium leading-relaxed"
                  data-testid="text-current-question"
                >
                  {questions[currentQuestionIndex]}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6">
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                  <Label className="text-zinc-400 text-xs sm:text-sm"></Label>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {silenceCountdown !== null && isListening && (
                      <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-[10px] sm:text-xs px-1.5 sm:px-2">
                        <Clock className="h-3 w-3 mr-0.5 sm:mr-1" />{" "}
                        {silenceCountdown}s left
                      </Badge>
                    )}
                    {isTranscribing && (
                      <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30 animate-pulse text-[10px] sm:text-xs px-1.5 sm:px-2">
                        <Loader2 className="h-3 w-3 mr-0.5 sm:mr-1 animate-spin" />{" "}
                        Transcribing...
                      </Badge>
                    )}
                    {isListening && (
                      <Badge className="bg-red-600/20 text-red-400 border-red-600/30 animate-pulse text-[10px] sm:text-xs px-1.5 sm:px-2">
                        <Mic className="h-3 w-3 mr-0.5 sm:mr-1" /> Recording
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Waveform / transcribing visual */}
                <div
                  data-testid="waveform-display"
                  className="flex items-end justify-center gap-[3px] sm:gap-1 h-[100px] sm:h-[120px] bg-zinc-700/50 border border-zinc-600 rounded-md px-4 py-3"
                >
                  {isTranscribing ? (
                    <div className="flex flex-col items-center justify-center gap-4 h-full">
                      <div className="flex items-center gap-3">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-3 h-3 bg-blue-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.18}s` }}
                          />
                        ))}
                      </div>
                      <p className="text-blue-400 text-xs font-medium">
                        Processing your answer...
                      </p>
                    </div>
                  ) : (
                    <>
                      {[20, 32, 48, 36, 56, 44, 64, 44, 56, 36, 48, 32, 20].map(
                        (maxH, i) => (
                          <div
                            key={i}
                            className={`w-1.5 sm:w-2 rounded-full ${
                              isListening
                                ? "bg-violet-400 waveform-bar"
                                : "bg-zinc-500 opacity-20"
                            }`}
                            style={
                              isListening
                                ? {
                                    height: `${maxH}px`,
                                    animationDuration: `${0.45 + (i % 4) * 0.1}s`,
                                    animationDelay: `${i * 0.07}s`,
                                  }
                                : { height: "4px" }
                            }
                          />
                        ),
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {isListening && (
                  <Button
                    onClick={stopListening}
                    variant="outline"
                    className="h-11 sm:h-10 border-red-600/50 text-red-400 hover:bg-red-600/10 hover:text-red-300 text-sm shrink-0"
                    data-testid="button-stop-recording"
                  >
                    <MicOff className="h-4 w-4 mr-1.5" />
                    Stop
                  </Button>
                )}
                <Button
                  onClick={manualSubmitAnswer}
                  disabled={isSpeaking || isListening || answerLocked || isTranscribing || !hasRecorded}
                  className="w-full h-11 sm:h-10 bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-40"
                  data-testid="button-submit-answer"
                >
                  {answerLocked ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                      Submitting...
                    </>
                  ) : currentQuestionIndex < questions.length - 1 ? (
                    "Next"
                  ) : (
                    "Finish"
                  )}
                </Button>
              </div>

              <p className="text-[11px] sm:text-xs text-zinc-500 text-center">
                {isListening
                  ? "Microphone is on — speak your answer clearly"
                  : isTranscribing
                    ? "Processing your answer..."
                    : "Microphone stopped — click Next when ready"}
              </p>

              <p className="text-[10px] text-zinc-600 text-center leading-tight mt-1">
                <span className="font-medium text-zinc-500">Android tip:</span> If permission is blocked, close any floating chat bubbles or overlay apps, then tap Retry.
              </p>
            </CardContent>
          </Card>
        </div>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "expired") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <Card
          className="w-full max-w-md bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur text-center"
          data-testid="card-expired"
        >
          <CardContent className="pt-8 pb-8 px-6 space-y-6">
            <div className="space-y-3">
              <h2 className="text-4xl font-extrabold text-red-500">
                Viva Ended
              </h2>
              <p className="text-zinc-300 text-base">
                Your viva was terminated because you navigated away from this
                page.
              </p>
              <p className="text-red-400 text-lg font-bold uppercase tracking-wide">
              </p>
            </div>
            <Button
              data-testid="btn-refresh"
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 text-base"
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "completed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <Card
          className="w-full max-w-md bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur text-center"
          data-testid="card-completion"
        >
          <CardContent className="pt-8 pb-6 px-4 sm:px-6">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-600/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2
              className="text-xl sm:text-2xl font-bold text-white mb-1"
              data-testid="heading-complete"
            >
              Exam Complete
            </h2>
            <p className="text-zinc-400 mb-6">Thank you, {studentInfo.name}</p>
            <p className="text-sm text-zinc-500">
              Your answers have been submitted and are being evaluated.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
