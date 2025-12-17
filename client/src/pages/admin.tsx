import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, TrendingUp, Users, BookOpen, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type VivaResult = {
  id: number;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  subject: string;
  score: number;
  maxScore: number;
  transcript: Array<{
    question: string;
    answer: string;
    feedback: string;
    score: number;
  }>;
  timestamp: string;
  status: string;
  sheetSynced: string | null;
};

export default function AdminPanel() {
  const [selectedResult, setSelectedResult] = useState<VivaResult | null>(null);

  const { data: results, isLoading, refetch } = useQuery<VivaResult[]>({
    queryKey: ["admin-results"],
    queryFn: async () => {
      const response = await fetch("/api/admin/results");
      if (!response.ok) throw new Error("Failed to fetch results");
      return response.json();
    },
  });

  const createSheetMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/create-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to create sheet");
      return response.json();
    },
    onSuccess: (data) => {
      toast.success("Google Sheet created successfully!", {
        description: `Spreadsheet ID: ${data.spreadsheetId}. Set GOOGLE_SHEET_ID env variable to enable auto-sync.`,
      });
    },
    onError: (error: any) => {
      toast.error("Failed to create Google Sheet", {
        description: error.message,
      });
    },
  });

  const stats = {
    total: results?.length || 0,
    avgScore: results && results.length > 0
      ? (results.reduce((acc, r) => acc + (r.score / r.maxScore) * 100, 0) / results.length).toFixed(1)
      : "0.0",
    subjects: results ? new Set(results.map(r => r.subject)).size : 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent" data-testid="heading-admin">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground text-lg">Monitor and review all viva voce examinations</p>
          </div>
          <Button
            onClick={() => createSheetMutation.mutate()}
            disabled={createSheetMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-create-sheet"
          >
            {createSheetMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Create Google Sheet
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-2 hover:border-violet-200 transition-all" data-testid="card-total-exams">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Examinations</CardTitle>
              <Users className="h-5 w-5 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-total-count">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-violet-200 transition-all" data-testid="card-avg-score">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingUp className="h-5 w-5 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-avg-score">{stats.avgScore}%</div>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-violet-200 transition-all" data-testid="card-subjects">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subjects</CardTitle>
              <BookOpen className="h-5 w-5 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-subject-count">{stats.subjects}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2" data-testid="card-results-table">
          <CardHeader>
            <CardTitle>Examination Results</CardTitle>
            <CardDescription>All viva voce examination records</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12" data-testid="loading-results">
                <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              </div>
            ) : results && results.length > 0 ? (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow
                        key={result.id}
                        className="cursor-pointer hover:bg-violet-50"
                        onClick={() => setSelectedResult(result)}
                        data-testid={`row-result-${result.id}`}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium" data-testid={`text-name-${result.id}`}>{result.studentName}</div>
                            <div className="text-sm text-muted-foreground" data-testid={`text-email-${result.id}`}>{result.studentEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize" data-testid={`badge-subject-${result.id}`}>
                            {result.subject}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-lg" data-testid={`text-score-${result.id}`}>
                            {result.score}/{result.maxScore}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-date-${result.id}`}>
                          {new Date(result.timestamp).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className="bg-green-600" data-testid={`badge-status-${result.id}`}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            className="text-violet-600 hover:text-violet-800 text-sm font-medium"
                            data-testid={`button-view-${result.id}`}
                          >
                            View Details
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-results">
                No examination results yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Examination Details</DialogTitle>
            <DialogDescription>
              Full transcript and evaluation
            </DialogDescription>
          </DialogHeader>
          {selectedResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Student Name</p>
                  <p className="font-medium" data-testid="dialog-student-name">{selectedResult.studentName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium" data-testid="dialog-student-email">{selectedResult.studentEmail}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium" data-testid="dialog-student-phone">{selectedResult.studentPhone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subject</p>
                  <p className="font-medium capitalize" data-testid="dialog-subject">{selectedResult.subject}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Final Score</p>
                  <p className="text-2xl font-bold text-violet-600" data-testid="dialog-score">
                    {selectedResult.score}/{selectedResult.maxScore}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium" data-testid="dialog-date">
                    {new Date(selectedResult.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-4">Transcript</h3>
                <div className="space-y-4">
                  {selectedResult.transcript.map((item, index) => (
                    <Card key={index} data-testid={`transcript-item-${index}`}>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Question {index + 1}</p>
                            <p className="font-medium" data-testid={`question-${index}`}>{item.question}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Student Answer</p>
                            <p data-testid={`answer-${index}`}>{item.answer}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Feedback</p>
                            <p className="text-sm" data-testid={`feedback-${index}`}>{item.feedback}</p>
                          </div>
                          <div>
                            <Badge variant={item.score >= 7 ? "default" : item.score >= 5 ? "secondary" : "destructive"} data-testid={`score-badge-${index}`}>
                              Score: {item.score}/10
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
