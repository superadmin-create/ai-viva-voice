import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mic, Volume2, CheckCircle2, User, Mail, Phone, ArrowLeft } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

type TranscriptItem = {
  question: string;
  answer: string;
  feedback: string;
  score: number;
};

type SubjectInfo = {
  name: string;
  slug: string;
  modules: { title: string; topics: string[] }[];
};

export default function VivaPage() {
  const [, params] = useRoute("/:subject");
  const subject = params?.subject || "";

  const [step, setStep] = useState<"register" | "preparing" | "exam" | "submitting" | "completed">("register");
  const [studentInfo, setStudentInfo] = useState({ name: "", email: "", phone: "" });
  
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoListenRef = useRef<boolean>(false);

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

  const evaluateAnswerMutation = useMutation({
    mutationFn: async ({ question, answer }: { question: string; answer: string }) => {
      const response = await fetch("/api/viva/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, subject }),
      });
      if (!response.ok) throw new Error("Failed to evaluate answer");
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

  // Initialize speech recognition
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
        if (finalTranscript) {
          setCurrentAnswer(prev => (prev + ' ' + finalTranscript).trim());
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // Auto-restart if we want to keep listening
        if (autoListenRef.current && recognitionRef.current) {
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
        if (event.error !== 'no-speech') {
          setIsListening(false);
        }
      };
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        autoListenRef.current = true;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.log("Recognition already started");
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    autoListenRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const speakText = useCallback(async (text: string, onComplete?: () => void) => {
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
          if (onComplete) onComplete();
        };
        await audioRef.current.play();
      }
    } catch (error) {
      console.error("TTS error:", error);
      setIsSpeaking(false);
      if (onComplete) onComplete();
    }
  }, []);

  const startExam = async () => {
    if (!studentInfo.name || !studentInfo.email || !studentInfo.phone) {
      toast.error("Please fill in all fields");
      return;
    }

    setStep("preparing");
    
    // Generate questions
    const result = await generateQuestionsMutation.mutateAsync(subject);
    setQuestions(result.questions);
    
    setStep("exam");

    // Greet student and ask first question
    const greeting = `Hello ${studentInfo.name}! Welcome to your ${subjectInfo?.name || subject} examination. I will ask you ${result.questions.length} questions. Please answer each question clearly. Let's begin.`;
    
    await speakText(greeting, () => {
      if (result.questions.length > 0) {
        speakText(`Question 1: ${result.questions[0]}`, () => {
          // Auto-start listening after question is asked
          startListening();
        });
      }
    });
  };

  const submitAnswer = async () => {
    if (!currentAnswer.trim()) {
      toast.error("Please provide an answer");
      return;
    }

    stopListening();
    setIsEvaluating(true);

    try {
      const evaluation = await evaluateAnswerMutation.mutateAsync({
        question: questions[currentQuestionIndex],
        answer: currentAnswer,
      });

      const newTranscriptItem: TranscriptItem = {
        question: questions[currentQuestionIndex],
        answer: currentAnswer,
        feedback: evaluation.feedback,
        score: evaluation.score,
      };

      const updatedTranscript = [...transcript, newTranscriptItem];
      setTranscript(updatedTranscript);
      setCurrentAnswer("");

      if (currentQuestionIndex < questions.length - 1) {
        // Move to next question immediately
        const nextIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
        setIsEvaluating(false);
        
        // Speak next question and auto-listen
        speakText(`Question ${nextIndex + 1}: ${questions[nextIndex]}`, () => {
          startListening();
        });
      } else {
        // Final submission
        setStep("submitting");
        const totalScore = updatedTranscript.reduce((sum, t) => sum + t.score, 0);

        await submitResultsMutation.mutateAsync({
          studentName: studentInfo.name,
          studentEmail: studentInfo.email,
          studentPhone: studentInfo.phone,
          subject,
          score: totalScore,
          maxScore: questions.length * 10,
          transcript: updatedTranscript,
          status: "completed",
          sheetSynced: "pending",
        });

        setStep("completed");
        setIsEvaluating(false);
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      toast.error("Failed to evaluate answer. Please try again.");
      setIsEvaluating(false);
      startListening();
    }
  };

  const displaySubjectName = subjectInfo?.name || subject.replace(/-/g, " ");

  if (step === "register") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-2 shadow-2xl" data-testid="card-registration">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent" data-testid="heading-viva-title">
              AI Viva Voce
            </CardTitle>
            <CardDescription className="text-lg">
              <Badge variant="outline" className="text-lg px-4 py-1 capitalize" data-testid="badge-subject">
                {displaySubjectName}
              </Badge>
            </CardDescription>
            {subjectInfo && (
              <div className="mt-4 text-left">
                <p className="text-sm text-muted-foreground mb-2">Topics covered:</p>
                <div className="flex flex-wrap gap-1">
                  {subjectInfo.modules.slice(0, 3).map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {m.title}
                    </Badge>
                  ))}
                  {subjectInfo.modules.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{subjectInfo.modules.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
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
              The AI will ask questions via voice. Make sure your microphone is enabled.
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
            <p className="text-center mt-2 text-muted-foreground" data-testid="text-question-progress">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
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
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Speak your answer or type here..."
                  className="min-h-[150px] text-lg"
                  data-testid="input-answer"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={isListening ? stopListening : startListening}
                  className={isListening ? 'border-red-500 text-red-500' : ''}
                  data-testid="button-voice"
                >
                  <Mic className={`h-4 w-4 mr-2 ${isListening ? 'animate-pulse' : ''}`} />
                  {isListening ? 'Stop Listening' : 'Start Listening'}
                </Button>
                <Button
                  onClick={submitAnswer}
                  disabled={isEvaluating || !currentAnswer.trim()}
                  className="flex-1 h-12 text-lg bg-violet-600 hover:bg-violet-700"
                  data-testid="button-submit-answer"
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Evaluating...
                    </>
                  ) : currentQuestionIndex < questions.length - 1 ? (
                    "Submit & Next Question"
                  ) : (
                    "Submit Final Answer"
                  )}
                </Button>
              </div>
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
            <h2 className="text-2xl font-bold mb-2">Submitting Results</h2>
            <p className="text-muted-foreground">Saving your examination to records...</p>
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
