import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mic, Volume2, CheckCircle2, User, Mail, Phone, ArrowLeft, Clock, GraduationCap, Users, ShieldCheck } from "lucide-react";
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

const SILENCE_TIMEOUT_MS = 3000;

export default function VivaPage() {
  const [, params] = useRoute("/:subject");
  const subject = params?.subject || "";

  const [step, setStep] = useState<"register" | "otp" | "preparing" | "exam" | "completed">("register");
  const [studentInfo, setStudentInfo] = useState({ name: "", email: "", phone: "", studentClass: "", division: "" });
  const [otpValue, setOtpValue] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [answerLocked, setAnswerLocked] = useState(false);
  const [micAttempts, setMicAttempts] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  
  const rawAnswersRef = useRef<RawAnswer[]>([]);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoListenRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentAnswerRef = useRef<string>("");
  const isProcessingRef = useRef<boolean>(false);
  const questionsRef = useRef<string[]>([]);
  const pendingStartRef = useRef<boolean>(false);
  const recognitionActiveRef = useRef<boolean>(false);

  useEffect(() => {
    currentAnswerRef.current = currentAnswer;
  }, [currentAnswer]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

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
    mutationFn: async (data: { studentName: string; studentEmail: string; studentPhone: string; subject: string; rawAnswers: RawAnswer[] }) => {
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
      setStep("completed");
    } catch (error) {
      console.error("Submit error:", error);
      toast.error("Failed to submit. Please try again.");
    }
  }, [studentInfo, subject, submitFastMutation]);

  const processAnswer = useCallback(async (answer: string, questionIndex: number) => {
    if (!answer.trim() || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    setAnswerLocked(true);
    clearSilenceTimer();
    autoListenRef.current = false;
    
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
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
  }, [clearSilenceTimer, submitExam]);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    
    setSilenceCountdown(SILENCE_TIMEOUT_MS / 1000);
    countdownIntervalRef.current = setInterval(() => {
      setSilenceCountdown(prev => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    silenceTimerRef.current = setTimeout(() => {
      clearSilenceTimer();
      const answer = currentAnswerRef.current;
      if (answer.trim() && !isProcessingRef.current) {
        processAnswer(answer, currentQuestionIndex);
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, processAnswer, currentQuestionIndex]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onstart = () => {
        recognitionActiveRef.current = true;
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setCurrentAnswer(prev => (prev + ' ' + finalTranscript).trim());
        }
        if (autoListenRef.current) {
          startSilenceTimer();
        }
      };

      recognitionRef.current.onend = () => {
        recognitionActiveRef.current = false;
        setIsListening(false);
        
        // Handle pending start request
        if (pendingStartRef.current && recognitionRef.current && !isProcessingRef.current) {
          pendingStartRef.current = false;
          try {
            recognitionRef.current.start();
          } catch (e) {}
        } else if (autoListenRef.current && recognitionRef.current && !isProcessingRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'no-speech' && currentAnswerRef.current.trim()) {
          startSilenceTimer();
        } else if (event.error !== 'no-speech') {
          recognitionActiveRef.current = false;
          setIsListening(false);
        }
      };
    }
    return () => clearSilenceTimer();
  }, [startSilenceTimer, clearSilenceTimer]);

  const startListeningWithSilenceDetection = useCallback(() => {
    if (recognitionRef.current && !isProcessingRef.current) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsSpeaking(false);
      }
      
      setMicAttempts(prev => prev + 1);
      setCurrentAnswer("");
      autoListenRef.current = true;
      
      if (recognitionActiveRef.current) {
        pendingStartRef.current = true;
        setIsListening(true);
        startSilenceTimer();
        return;
      }
      
      try {
        recognitionRef.current.start();
        startSilenceTimer();
      } catch (e) {
        pendingStartRef.current = true;
        setIsListening(true);
        startSilenceTimer();
      }
    }
  }, [startSilenceTimer]);

  const stopListening = useCallback(() => {
    autoListenRef.current = false;
    pendingStartRef.current = false;
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
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
    if (!studentInfo.name || !studentInfo.email || !studentInfo.phone || !studentInfo.studentClass || !studentInfo.division) {
      toast.error("Please fill in all fields");
      return;
    }
    setOtpSending(true);
    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: studentInfo.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send OTP");
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
        body: JSON.stringify({ email: studentInfo.email, otp: otpValue.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Invalid OTP");
      toast.success("Email verified!");
      rawAnswersRef.current = [];
      setStep("preparing");
      const result = await generateQuestionsMutation.mutateAsync(subject);
      setQuestions(result.questions);
      setStep("exam");
      if (result.questions.length > 0) {
        await speakTextAsync(result.questions[0]);
        startListeningWithSilenceDetection();
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOtpVerifying(false);
    }
  };

  const manualSubmitAnswer = () => {
    if (!currentAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }
    processAnswer(currentAnswer, currentQuestionIndex);
  };

  const displaySubjectName = subjectInfo?.name || subject.replace(/-/g, " ");

  if (step === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur" data-testid="card-registration">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-bold text-white" data-testid="heading-viva-title">
              AI Mock Viva
            </CardTitle>
            <CardDescription>
              <Badge variant="outline" className="text-base px-4 py-1 capitalize border-violet-500 text-violet-400" data-testid="badge-subject">
                {displaySubjectName}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-zinc-300 flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5" /> Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your name"
                  value={studentInfo.name}
                  onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500"
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-zinc-300 flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5" /> Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={studentInfo.email}
                  onChange={(e) => setStudentInfo({ ...studentInfo, email: e.target.value })}
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-zinc-300 flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5" /> Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone"
                  value={studentInfo.phone}
                  onChange={(e) => setStudentInfo({ ...studentInfo, phone: e.target.value })}
                  className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500"
                  data-testid="input-phone"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="studentClass" className="text-zinc-300 flex items-center gap-2 text-sm">
                    <GraduationCap className="h-3.5 w-3.5" /> Class
                  </Label>
                  <Input
                    id="studentClass"
                    placeholder="e.g., FY BMS"
                    value={studentInfo.studentClass}
                    onChange={(e) => setStudentInfo({ ...studentInfo, studentClass: e.target.value })}
                    className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500"
                    data-testid="input-class"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="division" className="text-zinc-300 flex items-center gap-2 text-sm">
                    <Users className="h-3.5 w-3.5" /> Division
                  </Label>
                  <Input
                    id="division"
                    placeholder="e.g., A"
                    value={studentInfo.division}
                    onChange={(e) => setStudentInfo({ ...studentInfo, division: e.target.value })}
                    className="bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500"
                    data-testid="input-division"
                  />
                </div>
              </div>
            </div>
            <Button
              onClick={sendOtpToEmail}
              className="w-full h-11 text-base bg-violet-600 hover:bg-violet-500 text-white"
              disabled={otpSending}
              data-testid="button-start-exam"
            >
              {otpSending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending OTP...</>
              ) : "Verify Email & Start"}
            </Button>
            <p className="text-xs text-zinc-500 text-center">
              Make sure your microphone is enabled
            </p>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-zinc-800/50 border-zinc-700 backdrop-blur">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center mb-2">
              <ShieldCheck className="h-6 w-6 text-violet-400" />
            </div>
            <CardTitle className="text-xl text-white" data-testid="text-otp-title">Verify Your Email</CardTitle>
            <p className="text-sm text-zinc-400">
              We've sent a 6-digit OTP to <span className="text-violet-400 font-medium">{studentInfo.email}</span>
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-zinc-300 text-sm">Enter OTP</Label>
              <Input
                value={otpValue}
                onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                className="bg-zinc-700/50 border-zinc-600 text-white text-center text-lg tracking-[0.5em] placeholder:tracking-normal placeholder:text-sm"
                maxLength={6}
                data-testid="input-otp"
              />
            </div>
            <Button
              onClick={verifyOtpAndStart}
              className="w-full h-11 text-base bg-violet-600 hover:bg-violet-500 text-white"
              disabled={otpVerifying || otpValue.length < 6}
              data-testid="button-verify-otp"
            >
              {otpVerifying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
              ) : "Verify & Start Exam"}
            </Button>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStep("register"); setOtpValue(""); }}
                className="text-zinc-400 hover:text-white"
                data-testid="button-back-to-register"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resendOtp}
                disabled={otpSending}
                className="text-violet-400 hover:text-violet-300"
                data-testid="button-resend-otp"
              >
                {otpSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Resend OTP
              </Button>
            </div>
            <p className="text-xs text-zinc-500 text-center">
              OTP is valid for 5 minutes. Check your spam folder if you don't see it.
            </p>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "preparing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-violet-500 mb-3" />
          <p className="text-lg text-white font-medium">Preparing questions...</p>
          <p className="text-sm text-zinc-400">{displaySubjectName}</p>
        </div>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "exam") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-4">
        <div className="container mx-auto max-w-3xl">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-400">Question {currentQuestionIndex + 1}/{questions.length}</span>
              <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">
                {displaySubjectName}
              </Badge>
            </div>
            <Progress value={((currentQuestionIndex + 1) / questions.length) * 100} className="h-1.5 bg-zinc-700" />
          </div>

          <Card className="bg-zinc-800/80 border-zinc-700 shadow-xl backdrop-blur" data-testid="card-question">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-full shrink-0 ${isSpeaking ? 'bg-violet-600 animate-pulse' : 'bg-zinc-700'}`}>
                  <Volume2 className={`h-5 w-5 ${isSpeaking ? 'text-white' : 'text-zinc-400'}`} />
                </div>
                <CardTitle className="text-lg text-white font-medium leading-relaxed" data-testid="text-current-question">
                  {questions[currentQuestionIndex]}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-zinc-400 text-sm">
                    Your Answer {micAttempts > 0 && !isListening && !answerLocked && `(Attempt ${micAttempts}/2)`}
                  </Label>
                  <div className="flex items-center gap-2">
                    {silenceCountdown !== null && currentAnswer.trim() && (
                      <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30 text-xs">
                        <Clock className="h-3 w-3 mr-1" /> {silenceCountdown}s
                      </Badge>
                    )}
                    {isListening && (
                      <Badge className="bg-red-600/20 text-red-400 border-red-600/30 animate-pulse text-xs">
                        <Mic className="h-3 w-3 mr-1" /> Recording
                      </Badge>
                    )}
                  </div>
                </div>
                <Textarea
                  value={currentAnswer}
                  readOnly
                  placeholder="Your spoken answer will appear here..."
                  className={`min-h-[120px] bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 resize-none cursor-default ${answerLocked ? 'opacity-70' : ''}`}
                  data-testid="input-answer"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isListening ? stopListening : startListeningWithSilenceDetection}
                  disabled={answerLocked || (!isListening && micAttempts >= 2)}
                  className={`border-zinc-600 ${isListening ? 'bg-red-600/20 text-red-400 border-red-600/40' : 'text-zinc-300 hover:bg-zinc-700'}`}
                  data-testid="button-voice"
                >
                  <Mic className={`h-4 w-4 mr-1.5 ${isListening ? 'animate-pulse' : ''}`} />
                  {isListening ? 'Stop' : micAttempts >= 2 ? 'No retries left' : micAttempts === 1 ? 'Retry Mic' : 'Mic'}
                </Button>
                <Button
                  onClick={manualSubmitAnswer}
                  disabled={!currentAnswer.trim() || answerLocked}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
                  data-testid="button-submit-answer"
                >
                  {answerLocked ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                  ) : currentQuestionIndex < questions.length - 1 ? "Next" : "Finish"}
                </Button>
              </div>

              <p className="text-xs text-zinc-500 text-center">
                {micAttempts >= 2
                  ? "No mic retries left — submit your answer"
                  : micAttempts === 1
                  ? "1 retry remaining if you need to re-record"
                  : "Auto-advances after 3 seconds of silence"}
              </p>
            </CardContent>
          </Card>
        </div>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "completed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex items-center justify-center p-6">
        <Card className="w-full max-w-md bg-zinc-800/80 border-zinc-700 shadow-2xl backdrop-blur text-center" data-testid="card-completion">
          <CardContent className="pt-8 pb-6">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-600/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1" data-testid="heading-complete">
              Exam Complete
            </h2>
            <p className="text-zinc-400 mb-6">
              Thank you, {studentInfo.name}
            </p>
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
