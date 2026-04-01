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
  User,
  Mail,
  Phone,
  ArrowLeft,
  RefreshCw,
  Clock,
  GraduationCap,
  Users,
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
};

const MAX_RECORDING_MS = 45000;

export default function VivaPage() {
  const [, params] = useRoute("/:subject");
  const subject = params?.subject || "";

  const sessionKey = `viva_${subject}`;

  const [step, setStepRaw] = useState<
    "register" | "otp" | "preparing" | "exam" | "completed" | "expired"
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
        | "otp"
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
    return { name: "", email: "", phone: "", studentClass: "", division: "" };
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

  const [otpValue, setOtpValue] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [attemptLimitReached, setAttemptLimitReached] = useState(false);

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

  useEffect(() => {
    currentAnswerRef.current = currentAnswer;
  }, [currentAnswer]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    studentInfoRef.current = studentInfo;
  }, [studentInfo]);

  const { data: subjectInfo } = useQuery<SubjectInfo>({
    queryKey: ["subject", subject],
    queryFn: async () => {
      const response = await fetch(`/api/subjects/${subject}`);
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
      subject: string;
      rawAnswers: RawAnswer[];
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

  const submitExam = useCallback(async () => {
    try {
      await submitFastMutation.mutateAsync({
        studentName: studentInfo.name,
        studentEmail: studentInfo.email,
        studentPhone: studentInfo.phone,
        studentClass: studentInfo.studentClass,
        studentDivision: studentInfo.division,
        subject,
        rawAnswers: rawAnswersRef.current,
      });
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
  }, [studentInfo, subject, submitFastMutation]);

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
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [clearSilenceTimer]);

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
              studentClass: info.studentClass,
              studentDivision: info.division,
              subject,
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
        const blobType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        sendAudioForTranscription(audioBlob);
      };

      recorder.start();
      setIsListening(true);
      startSilenceTimer();
    } catch (e) {
      console.error("Mic access error:", e);
      toast.error("Could not access microphone");
      setIsListening(false);
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

  const sendOtpToEmail = async () => {
    if (
      !studentInfo.name ||
      !studentInfo.email ||
      !studentInfo.phone ||
      !studentInfo.studentClass ||
      !studentInfo.division
    ) {
      toast.error("Please fill in all fields");
      return;
    }
    setOtpSending(true);
    setAttemptLimitReached(false);
    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: studentInfo.email, subject }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error?.includes("maximum")) {
          setAttemptLimitReached(true);
          return;
        }
        throw new Error(data.error || "Failed to send OTP");
      }
      toast.success("OTP sent to your email!");
      setStep("otp");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOtpSending(false);
    }
  };

  const resendOtp = async () => {
    setOtpSending(true);
    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: studentInfo.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send OTP");
      toast.success("New OTP sent!");
      setOtpValue("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtpAndStart = async () => {
    if (!otpValue.trim()) {
      toast.error("Please enter the OTP");
      return;
    }
    setOtpVerifying(true);
    try {
      const response = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: studentInfo.email,
          otp: otpValue.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invalid OTP");
      toast.success("Email verified!");
      rawAnswersRef.current = [];
      setStep("preparing");

      const result = await generateQuestionsMutation.mutateAsync(subject);
      const questionTexts = result.questions.map((q: any) =>
        typeof q === "string" ? q : q.question,
      );
      setQuestions(questionTexts);
      setStep("exam");

      if (questionTexts.length > 0) {
        try {
          await speakTextAsync(questionTexts[0]);
        } catch {}
        try {
          await startListeningWithSilenceDetection();
        } catch {}
      }
    } catch (error: any) {
      if (step === "preparing" || step === "register" || step === "otp") {
        setStep("register");
      }
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setOtpVerifying(false);
    }
  };

  const manualSubmitAnswer = () => {
    processAnswer(currentAnswer, currentQuestionIndex);
  };

  const displaySubjectName = subjectInfo?.name || subject.replace(/-/g, " ");

  if (step === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <Card
          className="w-full max-w-lg bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur"
          data-testid="card-registration"
        >
          <CardHeader className="text-center pb-2 px-4 sm:px-6">
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
                <li>Please allow microphone access to enable voice input.</li>
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
                  Once the microphone stops recording, your answer will appear.
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
                  Maximum attempts reached
                </p>
                <p className="text-red-300 text-xs">
                  You have already used both allowed attempts for this subject.
                  No further attempts are permitted.
                </p>
              </div>
            )}
            <Button
              onClick={sendOtpToEmail}
              className="w-full h-12 text-base bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
              disabled={otpSending || attemptLimitReached}
              data-testid="button-start-exam"
            >
              {otpSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending
                  OTP...
                </>
              ) : (
                "Verify Email & Start"
              )}
            </Button>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center px-4 py-6 sm:p-6">
        <Card className="w-full max-w-md bg-zinc-800/50 border-zinc-700 backdrop-blur">
          <CardHeader className="text-center px-4 sm:px-6">
            <div className="mx-auto w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center mb-2">
              <ShieldCheck className="h-6 w-6 text-violet-400" />
            </div>
            <CardTitle
              className="text-xl text-white"
              data-testid="text-otp-title"
            >
              Verify Your Email
            </CardTitle>
            <p className="text-sm text-zinc-400">
              We've sent a 6-digit OTP to{" "}
              <span className="text-violet-400 font-medium break-all">
                {studentInfo.email}
              </span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4 px-4 sm:px-6">
            <div>
              <Label className="text-zinc-300 text-sm">Enter OTP</Label>
              <Input
                value={otpValue}
                onChange={(e) =>
                  setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Enter 6-digit OTP"
                className="bg-zinc-700/50 border-zinc-600 text-white text-center text-lg tracking-[0.5em] placeholder:tracking-normal placeholder:text-sm h-12"
                maxLength={6}
                inputMode="numeric"
                data-testid="input-otp"
              />
            </div>
            <Button
              onClick={verifyOtpAndStart}
              className="w-full h-12 text-base bg-violet-600 hover:bg-violet-500 text-white"
              disabled={otpVerifying || otpValue.length < 6}
              data-testid="button-verify-otp"
            >
              {otpVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
                </>
              ) : (
                "Verify & Start Exam"
              )}
            </Button>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("register");
                  setOtpValue("");
                }}
                className="text-zinc-400 hover:text-white h-10 px-3"
                data-testid="button-back-to-register"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resendOtp}
                disabled={otpSending}
                className="text-violet-400 hover:text-violet-300 h-10 px-3"
                data-testid="button-resend-otp"
              >
                {otpSending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Resend OTP
              </Button>
            </div>
            <p className="text-xs text-zinc-500 text-center">
              OTP is valid for 5 minutes. Check your spam folder if you don't
              see it.
            </p>
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
                  disabled={isListening || answerLocked || isTranscribing}
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
