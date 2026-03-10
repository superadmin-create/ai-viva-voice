import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mic, Volume2, CheckCircle2, User, Mail, Phone, ArrowLeft, Clock, GraduationCap, Users } from "lucide-react";
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

  const [step, setStep] = useState<"register" | "preparing" | "exam" | "completed">("register");
  const [studentInfo, setStudentInfo] = useState({ name: "", email: "", phone: "", studentClass: "", division: "" });
  
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
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
    
    setCurrentAnswer("");
    
    if (questionIndex < allQuestions.length - 1) {
      const nextIndex = questionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
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
      // Stop audio if playing to allow immediate mic start
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsSpeaking(false);
      }
      
      autoListenRef.current = true;
      
      // If recognition is currently active/stopping, queue a pending start
      if (recognitionActiveRef.current) {
        pendingStartRef.current = true;
        setIsListening(true); // Show UI as listening
        startSilenceTimer();
        return;
      }
      
      try {
        recognitionRef.current.start();
        startSilenceTimer();
      } catch (e) {
        // If start fails (still stopping), queue it
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

  const startExam = async () => {
    if (!studentInfo.name || !studentInfo.email || !studentInfo.phone || !studentInfo.studentClass || !studentInfo.division) {
      toast.error("Please fill in all fields");
      return;
    }

    rawAnswersRef.current = [];
    setStep("preparing");
    
    const result = await generateQuestionsMutation.mutateAsync(subject);
    setQuestions(result.questions);
    setStep("exam");

    if (result.questions.length > 0) {
      await speakTextAsync(result.questions[0]);
      startListeningWithSilenceDetection();
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
              onClick={startExam}
              className="w-full h-11 text-base bg-violet-600 hover:bg-violet-500 text-white"
              disabled={generateQuestionsMutation.isPending}
              data-testid="button-start-exam"
            >
              {generateQuestionsMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</>
              ) : "Start Exam"}
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
                  <Label className="text-zinc-400 text-sm">Your Answer</Label>
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
                  onChange={(e) => {
                    setCurrentAnswer(e.target.value);
                    if (e.target.value.trim()) startSilenceTimer();
                  }}
                  placeholder="Speak your answer..."
                  className="min-h-[120px] bg-zinc-700/50 border-zinc-600 text-white placeholder:text-zinc-500 resize-none"
                  data-testid="input-answer"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isListening ? stopListening : startListeningWithSilenceDetection}
                  className={`border-zinc-600 ${isListening ? 'bg-red-600/20 text-red-400 border-red-600/40' : 'text-zinc-300 hover:bg-zinc-700'}`}
                  data-testid="button-voice"
                >
                  <Mic className={`h-4 w-4 mr-1.5 ${isListening ? 'animate-pulse' : ''}`} />
                  {isListening ? 'Stop' : 'Mic'}
                </Button>
                <Button
                  onClick={manualSubmitAnswer}
                  disabled={!currentAnswer.trim()}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
                  data-testid="button-submit-answer"
                >
                  {currentQuestionIndex < questions.length - 1 ? "Next" : "Finish"}
                </Button>
              </div>

              <p className="text-xs text-zinc-500 text-center">
                Auto-advances after 3 seconds of silence
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
            <p className="text-sm text-zinc-500 mb-6">
              Your answers have been submitted and are being evaluated.
            </p>
            <Link href="/">
              <Button variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-zinc-700" data-testid="button-home">
                <ArrowLeft className="h-4 w-4 mr-2" /> Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
