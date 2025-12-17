import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mic, Volume2, CheckCircle2, User, Mail, Phone, ArrowLeft, Clock } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

type TranscriptItem = {
  question: string;
  answer: string;
  feedback: string;
  score: number;
};

type PendingAnswer = {
  questionIndex: number;
  question: string;
  answer: string;
};

type SubjectInfo = {
  name: string;
  slug: string;
  modules: { title: string; topics: string[] }[];
};

const SILENCE_TIMEOUT_MS = 4000;

export default function VivaPage() {
  const [, params] = useRoute("/:subject");
  const subject = params?.subject || "";

  const [step, setStep] = useState<"register" | "preparing" | "exam" | "submitting" | "completed">("register");
  const [studentInfo, setStudentInfo] = useState({ name: "", email: "", phone: "" });
  
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  
  // Background evaluation tracking
  const [pendingEvaluations, setPendingEvaluations] = useState<number>(0);
  const pendingAnswersRef = useRef<PendingAnswer[]>([]);
  const evaluatedResultsRef = useRef<Map<number, TranscriptItem>>(new Map());
  
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoListenRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const currentAnswerRef = useRef<string>("");
  const isProcessingRef = useRef<boolean>(false);
  const questionsRef = useRef<string[]>([]);

  // Keep refs in sync with state
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

  const submitResultsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/viva/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to submit results");
      return response.json();
    },
  });

  // Background evaluation function
  const evaluateInBackground = useCallback(async (pending: PendingAnswer) => {
    try {
      const response = await fetch("/api/viva/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          question: pending.question, 
          answer: pending.answer, 
          subject 
        }),
      });
      
      if (!response.ok) throw new Error("Failed to evaluate answer");
      const evaluation = await response.json();
      
      const transcriptItem: TranscriptItem = {
        question: pending.question,
        answer: pending.answer,
        feedback: evaluation.feedback,
        score: evaluation.score,
      };
      
      evaluatedResultsRef.current.set(pending.questionIndex, transcriptItem);
      setPendingEvaluations(prev => Math.max(0, prev - 1));
      
      console.log(`Evaluated question ${pending.questionIndex + 1}: score ${evaluation.score}/10`);
    } catch (error) {
      console.error("Background evaluation error:", error);
      // Store with default score on error
      const transcriptItem: TranscriptItem = {
        question: pending.question,
        answer: pending.answer,
        feedback: "Evaluation failed - manual review required",
        score: 5,
      };
      evaluatedResultsRef.current.set(pending.questionIndex, transcriptItem);
      setPendingEvaluations(prev => Math.max(0, prev - 1));
    }
  }, [subject]);

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

  // Final submission after all questions answered
  const submitFinalResults = useCallback(async () => {
    setStep("submitting");
    
    // Wait for all pending evaluations to complete (max 30 seconds)
    const startTime = Date.now();
    while (evaluatedResultsRef.current.size < questionsRef.current.length && Date.now() - startTime < 30000) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Build final transcript in order
    const finalTranscript: TranscriptItem[] = [];
    for (let i = 0; i < questionsRef.current.length; i++) {
      const result = evaluatedResultsRef.current.get(i);
      if (result) {
        finalTranscript.push(result);
      }
    }
    
    const totalScore = finalTranscript.reduce((sum, t) => sum + t.score, 0);
    
    try {
      await submitResultsMutation.mutateAsync({
        studentName: studentInfo.name,
        studentEmail: studentInfo.email,
        studentPhone: studentInfo.phone,
        subject,
        score: totalScore,
        maxScore: questionsRef.current.length * 10,
        transcript: finalTranscript,
        status: "completed",
        sheetSynced: "pending",
      });
      setStep("completed");
    } catch (error) {
      console.error("Error submitting results:", error);
      toast.error("Failed to submit results. Please try again.");
      setStep("exam");
    }
  }, [studentInfo, subject, submitResultsMutation]);

  // Process answer - moves immediately to next question
  const processAnswer = useCallback(async (answer: string, questionIndex: number) => {
    if (!answer.trim() || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    clearSilenceTimer();
    autoListenRef.current = false;
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
    
    const allQuestions = questionsRef.current;
    
    // Queue answer for background evaluation
    const pending: PendingAnswer = {
      questionIndex,
      question: allQuestions[questionIndex],
      answer: answer.trim(),
    };
    pendingAnswersRef.current.push(pending);
    setPendingEvaluations(prev => prev + 1);
    
    // Start background evaluation (don't await)
    evaluateInBackground(pending);
    
    // Clear answer and immediately move to next question
    setCurrentAnswer("");
    
    if (questionIndex < allQuestions.length - 1) {
      const nextIndex = questionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      isProcessingRef.current = false;
      
      // Speak next question and auto-listen
      await speakTextAsync(`Question ${nextIndex + 1}: ${allQuestions[nextIndex]}`);
      startListeningWithSilenceDetection();
    } else {
      // All questions answered - submit results
      isProcessingRef.current = false;
      await submitFinalResults();
    }
  }, [clearSilenceTimer, evaluateInBackground, submitFinalResults]);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    
    // Start countdown display
    setSilenceCountdown(SILENCE_TIMEOUT_MS / 1000);
    countdownIntervalRef.current = setInterval(() => {
      setSilenceCountdown(prev => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);

    // Auto-submit after silence
    silenceTimerRef.current = setTimeout(() => {
      clearSilenceTimer();
      const answer = currentAnswerRef.current;
      if (answer.trim() && !isProcessingRef.current) {
        processAnswer(answer, currentQuestionIndex);
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer, processAnswer, currentQuestionIndex]);

  // Initialize speech recognition with silence detection
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        
        // Record last speech time on any result (interim or final)
        lastSpeechTimeRef.current = Date.now();
        
        if (finalTranscript) {
          setCurrentAnswer(prev => (prev + ' ' + finalTranscript).trim());
        }
        
        // Always restart silence timer on any speech activity
        if (autoListenRef.current) {
          startSilenceTimer();
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // Auto-restart if we want to keep listening
        if (autoListenRef.current && recognitionRef.current && !isProcessingRef.current) {
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch (e) {
            console.log("Could not restart recognition");
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'no-speech') {
          // No speech detected - if we have an answer, consider submitting
          if (currentAnswerRef.current.trim() && !isProcessingRef.current) {
            startSilenceTimer();
          }
        } else {
          setIsListening(false);
        }
      };
    }

    return () => {
      clearSilenceTimer();
    };
  }, [startSilenceTimer, clearSilenceTimer]);

  const startListeningWithSilenceDetection = useCallback(() => {
    if (recognitionRef.current && !isProcessingRef.current) {
      try {
        autoListenRef.current = true;
        recognitionRef.current.start();
        setIsListening(true);
        lastSpeechTimeRef.current = Date.now();
        // Start initial silence timer
        startSilenceTimer();
      } catch (e) {
        console.log("Recognition already started");
      }
    }
  }, [startSilenceTimer]);

  const stopListening = useCallback(() => {
    autoListenRef.current = false;
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

        if (!response.ok) throw new Error("Failed to generate speech");

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
        console.error("TTS error:", error);
        setIsSpeaking(false);
        resolve();
      }
    });
  }, []);

  const startExam = async () => {
    if (!studentInfo.name || !studentInfo.email || !studentInfo.phone) {
      toast.error("Please fill in all fields");
      return;
    }

    // Reset evaluation state
    pendingAnswersRef.current = [];
    evaluatedResultsRef.current = new Map();
    setPendingEvaluations(0);

    setStep("preparing");
    
    // Generate questions
    const result = await generateQuestionsMutation.mutateAsync(subject);
    setQuestions(result.questions);
    
    setStep("exam");

    // Greet student and ask first question
    const greeting = `Hello ${studentInfo.name}! Welcome to your ${subjectInfo?.name || subject} examination. I will ask you ${result.questions.length} questions. Please answer each question clearly. After you finish speaking, I will automatically move to the next question. Let's begin.`;
    
    await speakTextAsync(greeting);
    
    if (result.questions.length > 0) {
      await speakTextAsync(`Question 1: ${result.questions[0]}`);
      startListeningWithSilenceDetection();
    }
  };

  const manualSubmitAnswer = async () => {
    if (!currentAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }
    processAnswer(currentAnswer, currentQuestionIndex);
  };

  const displaySubjectName = subjectInfo?.name || subject.replace(/-/g, " ");

  if (step === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-2 shadow-2xl" data-testid="card-registration">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent" data-testid="heading-viva-title">
              AI Mock Viva
            </CardTitle>
            <CardDescription className="text-lg">
              <Badge variant="outline" className="text-lg px-4 py-1 capitalize" data-testid="badge-subject">
                {displaySubjectName}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  placeholder="Enter your full name"
                  value={studentInfo.name}
                  onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={studentInfo.email}
                  onChange={(e) => setStudentInfo({ ...studentInfo, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={studentInfo.phone}
                  onChange={(e) => setStudentInfo({ ...studentInfo, phone: e.target.value })}
                  data-testid="input-phone"
                />
              </div>
            </div>
            <Button
              onClick={startExam}
              className="w-full h-12 text-lg bg-violet-600 hover:bg-violet-700"
              disabled={generateQuestionsMutation.isPending}
              data-testid="button-start-exam"
            >
              Start Examination
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              The AI will ask questions via voice and automatically listen for your answers. Make sure your microphone is enabled.
            </p>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "preparing") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-2 shadow-2xl">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-violet-600 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Preparing Your Examination</h2>
            <p className="text-muted-foreground">Generating questions for {displaySubjectName}...</p>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "exam") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 p-6">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-6">
            <Progress value={((currentQuestionIndex + 1) / questions.length) * 100} className="h-3" data-testid="progress-exam" />
            <div className="flex justify-between items-center mt-2">
              <p className="text-muted-foreground" data-testid="text-question-progress">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
              {pendingEvaluations > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Processing {pendingEvaluations} answer{pendingEvaluations > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          <Card className="border-2 shadow-2xl" data-testid="card-question">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${isSpeaking ? 'bg-violet-100 animate-pulse' : 'bg-slate-100'}`}>
                  <Volume2 className={`h-6 w-6 ${isSpeaking ? 'text-violet-600' : 'text-muted-foreground'}`} />
                </div>
                <CardTitle className="text-xl" data-testid="text-current-question">
                  {questions[currentQuestionIndex]}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label htmlFor="answer">Your Answer</Label>
                  <div className="flex items-center gap-2">
                    {silenceCountdown !== null && currentAnswer.trim() && (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        <Clock className="h-3 w-3 mr-1" />
                        Next in {silenceCountdown}s
                      </Badge>
                    )}
                    {isListening && (
                      <Badge variant="default" className="bg-red-500 animate-pulse">
                        <Mic className="h-3 w-3 mr-1" />
                        Listening...
                      </Badge>
                    )}
                  </div>
                </div>
                <Textarea
                  id="answer"
                  value={currentAnswer}
                  onChange={(e) => {
                    setCurrentAnswer(e.target.value);
                    if (e.target.value.trim()) {
                      startSilenceTimer();
                    }
                  }}
                  placeholder="Speak your answer - it will move to the next question automatically..."
                  className="min-h-[150px] text-lg"
                  data-testid="input-answer"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={isListening ? stopListening : startListeningWithSilenceDetection}
                  className={isListening ? 'border-red-500 text-red-500' : ''}
                  disabled={isProcessingRef.current}
                  data-testid="button-voice"
                >
                  <Mic className={`h-4 w-4 mr-2 ${isListening ? 'animate-pulse' : ''}`} />
                  {isListening ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  onClick={manualSubmitAnswer}
                  disabled={!currentAnswer.trim()}
                  className="flex-1 h-12 text-lg bg-violet-600 hover:bg-violet-700"
                  data-testid="button-submit-answer"
                >
                  {currentQuestionIndex < questions.length - 1 ? "Next Question" : "Finish Exam"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Answers are evaluated in the background while you continue. Auto-advances after 4 seconds of silence.
              </p>
            </CardContent>
          </Card>
        </div>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "submitting") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-2 shadow-2xl">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-violet-600 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Finalizing Results</h2>
            <p className="text-muted-foreground">
              {pendingEvaluations > 0 
                ? `Completing ${pendingEvaluations} evaluation${pendingEvaluations > 1 ? 's' : ''}...` 
                : "Saving your examination..."
              }
            </p>
          </CardContent>
        </Card>
        <audio ref={audioRef} hidden />
      </div>
    );
  }

  if (step === "completed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl border-2 shadow-2xl" data-testid="card-completion">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-4xl font-bold" data-testid="heading-complete">
              Examination Complete!
            </CardTitle>
            <CardDescription className="text-lg mt-2">
              Thank you for participating, {studentInfo.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <div className="bg-violet-50 rounded-lg p-6">
              <p className="text-muted-foreground mb-2">Your examination has been submitted and saved</p>
              <p className="text-sm text-muted-foreground">
                Results are only visible to the administrator. Your performance has been recorded and synced to the examination records.
              </p>
            </div>

            <div className="pt-4">
              <Link href="/">
                <Button
                  variant="outline"
                  data-testid="button-home"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Return to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
