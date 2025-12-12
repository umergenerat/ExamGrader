
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { gradeExam, ExamReference } from './services/geminiService';
import type { GradingResult } from './types';
import ResultsDisplay from './components/ResultsDisplay';
import Loader from './components/Loader';
import SettingsModal from './components/SettingsModal';
import GroupAnalytics from './components/GroupAnalytics';
import { UploadIcon, ArchiveIcon, SettingsIcon, TrashIcon, DownloadIcon, FileTextIcon, ImageIcon, AlertTriangleIcon, RefreshIcon, CameraIcon, SearchIcon, XCircleIcon, PlusCircleIcon, CheckIcon, SortIcon, ClockIcon, ChartBarIcon, TableCellsIcon } from './components/icons';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import PWAInstallBanner from './components/PWAInstallBanner';
import { useAppContext } from './context/AppContext';
import ThemeToggle from './components/ThemeToggle';
import LanguageToggle from './components/LanguageToggle';

type AppStep = 'studentInfo' | 'fileUpload' | 'grading' | 'results';

export type GradingStrictness = 'Lenient' | 'Normal' | 'Strict';
export type PlagiarismSensitivity = 'Low' | 'Medium' | 'High';
export interface AppSettings {
    apiKey: string;
    graderName: string;
    gradingStrictness: GradingStrictness;
    plagiarismSensitivity: PlagiarismSensitivity;
    customInstructions: string;
    studentGroups: string;
}
interface ExamFile {
    file: File;
    previewUrl: string; // Object URL for image previews
}

// Hashing utility to create a unique fingerprint for exam files.
const generateContentHash = async (files: File[]): Promise<string> => {
    // Sort files by name to ensure consistent order
    const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
    const fileBuffers = await Promise.all(sortedFiles.map(file => file.arrayBuffer()));

    // Concatenate all array buffers into one for a single hash
    const combinedBuffer = new Uint8Array(fileBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0));
    let offset = 0;
    for (const buffer of fileBuffers) {
        combinedBuffer.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    }

    // Use the built-in browser API to generate a SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', combinedBuffer);

    // Convert the hash buffer to a hexadecimal string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};


const App: React.FC = () => {
    const { t, language, translations } = useAppContext();
    const [step, setStep] = useState<AppStep>('studentInfo');
    const [studentName, setStudentName] = useState<string>('');
    const [studentGroup, setStudentGroup] = useState<string>('');
    const [totalMarks, setTotalMarks] = useState<number>(40);
    const [submissionTime, setSubmissionTime] = useState<string>(''); // ISO string for input
    const [examFiles, setExamFiles] = useState<ExamFile[]>([]);
    const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [notification, setNotification] = useState<string | null>(null);
    const [archivedResults, setArchivedResults] = useState<GradingResult[]>([]);
    const [showArchive, setShowArchive] = useState<boolean>(false);
    const [viewingArchivedResult, setViewingArchivedResult] = useState<GradingResult | null>(null);
    const [settings, setSettings] = useState<AppSettings>({
        apiKey: '',
        graderName: '',
        gradingStrictness: 'Normal',
        plagiarismSensitivity: 'Medium',
        customInstructions: '',
        studentGroups: '',
    });
    const [showSettings, setShowSettings] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);
    const [isStandalone, setIsStandalone] = useState<boolean>(false);
    const [pwaInstallDismissed, setPwaInstallDismissed] = useState<boolean>(false);
    const [sessionSubmissions, setSessionSubmissions] = useState<Record<string, { studentName: string; contentHash: string }[]>>({});
    const [exportProgress, setExportProgress] = useState<string>('');
    const [penalizedArchiveEntry, setPenalizedArchiveEntry] = useState<{ originalResult: GradingResult, newResult: GradingResult } | null>(null);

    // New state for exam references
    const [examReferences, setExamReferences] = useState<Record<string, ExamReference>>({});
    const [showReferenceEditor, setShowReferenceEditor] = useState(false);
    const [referenceInputType, setReferenceInputType] = useState<'files' | 'text'>('files');
    const [referenceFiles, setReferenceFiles] = useState<ExamFile[]>([]);
    const [referenceText, setReferenceText] = useState('');
    
    // Analytics State
    const [selectedAnalyticsGroup, setSelectedAnalyticsGroup] = useState<string | null>(null);

    // Camera state
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraTarget, setCameraTarget] = useState<'student' | 'reference'>('student');
    const [lastCaptureTime, setLastCaptureTime] = useState<number | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Archive search and sort state
    const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
    const [archiveSortOrder, setArchiveSortOrder] = useState<'newest' | 'oldest'>('newest');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const referenceFileInputRef = useRef<HTMLInputElement>(null);

    // Helper to get current datetime for input
    const getCurrentDateTimeLocal = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        return now.toISOString().slice(0, 16);
    };

    useEffect(() => {
        // Set default submission time to now on mount
        setSubmissionTime(getCurrentDateTimeLocal());

        try {
            // Check environment variables first (Support both API_KEY and GEMINI_API_KEY)
            const envApiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
            const storedApiKey = localStorage.getItem('geminiApiKey') || envApiKey;
            
            const storedGraderName = localStorage.getItem('graderName') || '';
            const storedStrictness = (localStorage.getItem('gradingStrictness') as GradingStrictness) || 'Normal';
            const storedSensitivity = (localStorage.getItem('plagiarismSensitivity') as PlagiarismSensitivity) || 'Medium';
            const storedInstructions = localStorage.getItem('customInstructions') || '';
            const storedGroups = localStorage.getItem('studentGroups') || '';
            
            setSettings({
                apiKey: storedApiKey,
                graderName: storedGraderName,
                gradingStrictness: storedStrictness,
                plagiarismSensitivity: storedSensitivity,
                customInstructions: storedInstructions,
                studentGroups: storedGroups,
            });

            // If we loaded a key from Env but not local storage, save it to local storage for consistency
            if (envApiKey && !localStorage.getItem('geminiApiKey')) {
                localStorage.setItem('geminiApiKey', envApiKey);
            }

            const parsedGroups = storedGroups.split('\n').map(g => g.trim()).filter(Boolean);
            if(parsedGroups.length > 0) {
                setStudentGroup(parsedGroups[0]);
            }

            const storedResults = localStorage.getItem('archivedExams');
            if (storedResults) {
                const parsed = JSON.parse(storedResults);
                if (Array.isArray(parsed)) {
                    setArchivedResults(parsed);
                }
            }
             const dismissed = localStorage.getItem('pwaInstallDismissed') === 'true';
            setPwaInstallDismissed(dismissed);
        } catch (e) {
            console.error("Failed to parse data from localStorage", e);
        }

        setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);

        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            if (window.matchMedia('(display-mode: standalone)').matches) {
                return; 
            }
            setInstallPromptEvent(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            examFiles.forEach(f => {
                if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
            });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const availableGroups = useMemo(() => {
        return settings.studentGroups
            .split('\n')
            .map(g => g.trim())
            .filter(g => g.length > 0);
    }, [settings.studentGroups]);

    const handleInstallApp = async () => {
        if (!installPromptEvent) return;
        installPromptEvent.prompt();
        const { outcome } = await installPromptEvent.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        setInstallPromptEvent(null);
        setPwaInstallDismissed(true);
        localStorage.setItem('pwaInstallDismissed', 'true');
    };
    
    const handleDismissInstall = () => {
        setPwaInstallDismissed(true);
        localStorage.setItem('pwaInstallDismissed', 'true');
    };

    const handleSaveSettings = (newSettings: AppSettings) => {
        setSettings(newSettings);
        localStorage.setItem('geminiApiKey', newSettings.apiKey);
        localStorage.setItem('graderName', newSettings.graderName);
        localStorage.setItem('gradingStrictness', newSettings.gradingStrictness);
        localStorage.setItem('plagiarismSensitivity', newSettings.plagiarismSensitivity);
        localStorage.setItem('customInstructions', newSettings.customInstructions);
        localStorage.setItem('studentGroups', newSettings.studentGroups);
        setShowSettings(false);
        if (error?.includes("API")) {
            setError(null);
        }

        const newGroups = newSettings.studentGroups.split('\n').map(g => g.trim()).filter(Boolean);
        if (newGroups.length > 0 && !newGroups.includes(studentGroup)) {
            setStudentGroup(newGroups[0]);
        } else if (newGroups.length === 0) {
            setStudentGroup('');
        }
    };

    const handleStudentInfoSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentName.trim()) {
            setFormError(t('studentInfo.error.nameRequired'));
            return;
        }
        if (!studentGroup.trim()) {
            setFormError(t('studentInfo.error.groupRequired'));
            return;
        }
        if (totalMarks <= 0) {
            setFormError(t('studentInfo.error.marksRequired'));
            return;
        }
        setFormError(null);
        // Reset submission time to current on new flow
        setSubmissionTime(getCurrentDateTimeLocal());
        setStep('fileUpload');
    };

    const addFilesToState = (files: File[]) => {
        const validFiles = files.filter(file => 
            file.type.startsWith('image/') || file.type === 'application/pdf'
        );
        const uniqueNewFiles: ExamFile[] = validFiles
            .filter(vf => !examFiles.some(ef => ef.file.name === vf.name && ef.file.size === vf.size))
            .map(file => ({
                file,
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
            }));

        if (validFiles.length !== files.length) {
            setError(t('fileUpload.error.invalidFiles'));
        } else {
            setError(null);
        }

        setExamFiles(prev => [...prev, ...uniqueNewFiles]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFilesToState(Array.from(e.target.files));
    };
    
    const addReferenceFilesToState = (files: File[]) => {
        const validFiles = files.filter(file => 
            file.type.startsWith('image/') || file.type === 'application/pdf'
        );
         const uniqueNewFiles: ExamFile[] = validFiles
            .filter(vf => !referenceFiles.some(rf => rf.file.name === vf.name && rf.file.size === vf.size))
            .map(file => ({
                file,
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
            }));
            
        setReferenceFiles(prev => [...prev, ...uniqueNewFiles]);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if(e.dataTransfer.files) addFilesToState(Array.from(e.dataTransfer.files));
    };

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragover') setIsDragging(true);
        if (e.type === 'dragleave') setIsDragging(false);
    };

    const handleRemoveFile = (index: number) => {
        setExamFiles(prev => {
            const fileToRemove = prev[index];
            if (fileToRemove.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    };
    
    const handleRemoveReferenceFile = (index: number) => {
        setReferenceFiles(prev => {
            const fileToRemove = prev[index];
             if (fileToRemove.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
             return prev.filter((_, i) => i !== index);
        });
    }

    const handleGradeExam = useCallback(async () => {
        if (!settings.apiKey) {
            setError(t('errors.API_KEY_MISSING_SETTINGS'));
            setShowSettings(true);
            return;
        }

        if (examFiles.length === 0 || !studentName || !studentGroup) return;

        const isDuplicate = archivedResults.some(result => 
            result.studentName.trim().toLowerCase() === studentName.trim().toLowerCase() &&
            result.studentGroup.trim().toLowerCase() === studentGroup.trim().toLowerCase()
        );

        if (isDuplicate) {
            if (!window.confirm(t('app.duplicateStudentWarning', { studentName, studentGroup }))) {
                return;
            }
        }

        setStep('grading');
        setIsLoading(true);
        setError(null);
        setNotification(null);
        setGradingResult(null);
        setPenalizedArchiveEntry(null);

        try {
            const files = examFiles.map(ef => ef.file);
            const contentHash = await generateContentHash(files);
            const groupSubmissions = sessionSubmissions[studentGroup] || [];
            const matchingSubmission = groupSubmissions.find(
                sub => sub.contentHash === contentHash && sub.studentName !== studentName
            );
            const matchingStudentName = matchingSubmission ? matchingSubmission.studentName : null;
            const currentReference = examReferences[studentGroup] || null;

            // Use the manually selected submission time or default to current time
            const finalSubmissionTime = submissionTime 
                ? new Date(submissionTime).toISOString() 
                : new Date().toISOString();

            const result = await gradeExam(
                studentName, 
                studentGroup, 
                files, 
                totalMarks, 
                settings.apiKey,
                settings.gradingStrictness,
                settings.plagiarismSensitivity,
                settings.customInstructions,
                matchingStudentName,
                currentReference,
                language,
                finalSubmissionTime
            );
            
            setSessionSubmissions(prev => {
                const currentSub = { studentName, contentHash };
                const existingSubs = prev[studentGroup] || [];
                if (existingSubs.some(s => s.studentName === studentName && s.contentHash === contentHash)) {
                    return prev;
                }
                return { ...prev, [studentGroup]: [...existingSubs, currentSub] };
            });

            if (matchingStudentName) {
                let originalMatchedResult: GradingResult | null = null;
                const updatedArchive = archivedResults.map(res => {
                    if (res.studentName === matchingStudentName && res.studentGroup === studentGroup) {
                        originalMatchedResult = { ...res };
                        
                        const penalizedResult = { ...res };
                        penalizedResult.score = 0;
                        penalizedResult.detailedFeedback = penalizedResult.detailedFeedback.map(fb => ({
                            ...fb,
                            marksAwarded: 0,
                        }));
                        penalizedResult.cheatingAnalysis = {
                            detected: true,
                            reasoning: t('app.cheatingPenaltyReason', { studentName: studentName })
                        };
                        return penalizedResult;
                    }
                    return res;
                });
    
                if (originalMatchedResult) {
                     const finalUpdatedArchive = updatedArchive;
                     setArchivedResults(finalUpdatedArchive);
                     localStorage.setItem('archivedExams', JSON.stringify(finalUpdatedArchive));
                     setNotification(t('app.cheatingNotification', { studentName: matchingStudentName }));
                     
                     const newResult = finalUpdatedArchive.find(r => r.id === originalMatchedResult!.id)!;
                     setPenalizedArchiveEntry({ originalResult: originalMatchedResult, newResult });
                }
            }

            setGradingResult(result);
            setStep('results');
        } catch (err: any) {
            const errorMessageKey = err.message as keyof typeof translations.en.errors;
            setError(t(`errors.${String(errorMessageKey)}`) || t('errors.UNEXPECTED_GRADING_ERROR'));
            setStep('fileUpload');
        } finally {
            setIsLoading(false);
        }
    }, [examFiles, studentName, studentGroup, totalMarks, settings, sessionSubmissions, archivedResults, language, t, examReferences, submissionTime]);

    const handleRestoreArchivedResult = () => {
        if (!penalizedArchiveEntry) return;

        const { originalResult } = penalizedArchiveEntry;
        
        const restoredArchive = archivedResults.map(res => {
            if (res.id === originalResult.id) {
                return originalResult;
            }
            return res;
        });
        
        setArchivedResults(restoredArchive);
        localStorage.setItem('archivedExams', JSON.stringify(restoredArchive));
        
        setPenalizedArchiveEntry(null);
        setNotification(t('app.restoreNotification', { studentName: originalResult.studentName }));
    };

    const handleReset = () => {
        setStep('studentInfo');
        setStudentName('');
        setStudentGroup(availableGroups.length > 0 ? availableGroups[0] : '');
        setTotalMarks(40);
        setSubmissionTime(getCurrentDateTimeLocal());
        setExamFiles([]);
        setGradingResult(null);
        setError(null);
        setNotification(null);
        setFormError(null);
        setPenalizedArchiveEntry(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    
    const handleArchiveResult = () => {
        if (!gradingResult) return;
        const updatedArchive = [gradingResult, ...archivedResults];
        setArchivedResults(updatedArchive);
        localStorage.setItem('archivedExams', JSON.stringify(updatedArchive));
        handleReset();
    };

    const handleGradeNextInGroup = () => {
        if (!gradingResult) return;
        
        const updatedArchive = [gradingResult, ...archivedResults];
        setArchivedResults(updatedArchive);
        localStorage.setItem('archivedExams', JSON.stringify(updatedArchive));

        setStep('studentInfo');
        setStudentName('');
        setSubmissionTime(getCurrentDateTimeLocal());
        setExamFiles([]);
        setGradingResult(null);
        setError(null);
        setNotification(null);
        setFormError(null);
        setPenalizedArchiveEntry(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };


    const handleRegrade = () => {
        if (window.confirm(t('app.regradeConfirmation'))) {
            setNotification(null);
            setPenalizedArchiveEntry(null);
            handleGradeExam();
        }
    };
    
    const handleDeleteArchivedResult = (resultId: string) => {
        const updatedArchive = archivedResults.filter(r => r.id !== resultId);
        setArchivedResults(updatedArchive);
        localStorage.setItem('archivedExams', JSON.stringify(updatedArchive));
    };

    const handleClearArchive = () => {
        if (window.confirm(t('archive.clearConfirmation'))) {
            setArchivedResults([]);
            localStorage.removeItem('archivedExams');
            setSessionSubmissions({});
            setExamReferences({});
        }
    };
    
    const handleRegradeFromArchive = (result: GradingResult) => {
        if (window.confirm(t('archive.regradeConfirmation', { studentName: result.studentName }))) {
            setStudentName(result.studentName);
            setStudentGroup(result.studentGroup);
            setTotalMarks(result.totalMarks);
            // If it's an old record without explicit timestamp, default to its ID (creation time)
            const oldTimestamp = result.timestamp || result.id;
            // Convert to local ISO format for input
            const date = new Date(oldTimestamp);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            setSubmissionTime(date.toISOString().slice(0, 16));
            
            setExamFiles([]);
            setGradingResult(null);
            setError(null);
            setNotification(null);
            setFormError(null);
            setPenalizedArchiveEntry(null);
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }

            setShowArchive(false);
            setViewingArchivedResult(null);
            setStep('fileUpload');
        }
    };
    
    const renderResultToPdf = async (result: GradingResult): Promise<jsPDF> => {
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = '1024px';
        document.body.appendChild(tempContainer);
        
        const isDarkMode = document.documentElement.classList.contains('dark');
        if (isDarkMode) {
            document.documentElement.classList.remove('dark');
        }

        let root: any = null;

        try {
            const { createRoot } = await import('react-dom/client');
            root = createRoot(tempContainer);
            await new Promise<void>(resolve => {
                root.render(<ResultsDisplay result={result} graderName={settings.graderName} />);
                setTimeout(resolve, 500); 
            });

            const canvas = await html2canvas(tempContainer.firstElementChild as HTMLElement, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });
            
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [canvas.width, canvas.height],
                hotfixes: ['px_scaling'],
            });
            
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
            
            return pdf;
        } finally {
            if (root) {
                root.unmount();
            }
            document.body.removeChild(tempContainer);
            if (isDarkMode) {
                document.documentElement.classList.add('dark');
            }
        }
    };

    const handleExportArchive = async () => {
        if (archivedResults.length === 0 || exportProgress) return;
    
        setExportProgress(t('archive.export.starting'));
        
        try {
            const { default: JSZip } = await import('jszip');
            const { saveAs } = await import('file-saver');
            const zip = new JSZip();
    
            const dataStr = JSON.stringify(archivedResults, null, 2);
            zip.file("archive_data.json", dataStr);
    
            for (let i = 0; i < archivedResults.length; i++) {
                const result = archivedResults[i];
                setExportProgress(t('archive.export.progress', { current: i + 1, total: archivedResults.length, studentName: result.studentName }));
                
                const pdf = await renderResultToPdf(result);
                const pdfBlob = pdf.output('blob');
                
                const groupFolder = result.studentGroup.replace(/[^a-zA-Z0-9]/g, '_') || 'No_Group';
                const fileName = `${result.studentName.replace(/[^a-zA-Z0-9]/g, '_')}_${result.id}.pdf`;
                
                zip.folder(groupFolder)?.file(fileName, pdfBlob);
            }
    
            setExportProgress(t('archive.export.compressing'));
            const content = await zip.generateAsync({ type: "blob" });
            
            saveAs(content, `archive-${new Date().toISOString().split('T')[0]}.zip`);
            
        } catch (error) {
            console.error("Error exporting archive:", error);
            setError(t('archive.export.error'));
        } finally {
            setExportProgress('');
        }
    };

    const handleExportGroupExcel = (groupName: string, results: GradingResult[]) => {
        try {
            const data = results.map(r => ({
                'Name': r.studentName,
                'Score': r.score,
                'Total': r.totalMarks,
                'Received Date': new Date(r.timestamp || r.id).toLocaleDateString(),
                'Received Time': new Date(r.timestamp || r.id).toLocaleTimeString(),
                'Strengths': r.strengths.join(', '),
                'Weaknesses': r.weaknesses.join(', '),
            }));

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            // Right-to-left config for Arabic support in some viewers
            wb.Workbook = { Views: [{ RTL: language === 'ar' }] }; 
            XLSX.utils.book_append_sheet(wb, ws, "Grades");
            
            // Clean filename
            const cleanGroupName = groupName.replace(/[^a-zA-Z0-9]/g, '_');
            XLSX.writeFile(wb, `${cleanGroupName}_grades_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (err) {
            console.error("Excel export failed:", err);
            setError("Failed to export Excel file.");
        }
    };

    const handleViewArchivedResult = (result: GradingResult) => {
        setViewingArchivedResult(result);
    };

    const handleRunTests = async () => {
        try {
            const { runUnitTests } = await import('./services/geminiService');
            await runUnitTests();
            alert('Tests finished. Check the developer console for results.');
        } catch (e) {
            console.error("Failed to run tests", e);
            alert('An error occurred while running tests. Check the console.');
        }
    };

    // --- Reference Manager Logic ---
    const handleSetReference = () => {
        let reference: ExamReference | null = null;
        if (referenceInputType === 'files' && referenceFiles.length > 0) {
            reference = { type: 'files', content: referenceFiles.map(rf => rf.file) };
        } else if (referenceInputType === 'text' && referenceText.trim()) {
            reference = { type: 'text', content: referenceText.trim() };
        }

        if (reference && studentGroup) {
            setExamReferences(prev => ({ ...prev, [studentGroup]: reference! }));
        }
        setShowReferenceEditor(false);
    };

    const handleRemoveReference = () => {
        if (!studentGroup) return;
        const newRefs = { ...examReferences };
        delete newRefs[studentGroup];
        setExamReferences(newRefs);
        setShowReferenceEditor(false);
    };

    const handleOpenReferenceEditor = () => {
        const currentRef = examReferences[studentGroup];
        if (currentRef) {
            setReferenceInputType(currentRef.type);
            if (currentRef.type === 'files') {
                const existingFiles = (currentRef.content as File[]).map(f => ({
                     file: f,
                     previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
                }));
                setReferenceFiles(existingFiles);
                setReferenceText('');
            } else {
                setReferenceText(currentRef.content as string);
                setReferenceFiles([]);
            }
        } else {
            setReferenceInputType('files');
            setReferenceFiles([]);
            setReferenceText('');
        }
        setShowReferenceEditor(true);
    };
    
    // --- Camera Logic ---
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const handleOpenCamera = (target: 'student' | 'reference' = 'student') => {
        setCameraTarget(target);
        setIsCameraOpen(true);
    };

    const handleCloseCamera = () => {
        setIsCameraOpen(false);
    };
    
    const handleCapture = () => {
        const video = videoRef.current;
        if (!video) return;

        setLastCaptureTime(Date.now());
        setTimeout(() => setLastCaptureTime(null), 200);

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            if (blob) {
                const fileName = `capture-${Date.now()}.jpeg`;
                const file = new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
                if (cameraTarget === 'student') {
                    addFilesToState([file]);
                } else {
                    addReferenceFilesToState([file]);
                }
            }
        }, 'image/jpeg', 0.95);
    };

    useEffect(() => {
        let isMounted = true;

        const initCamera = async () => {
            if (isCameraOpen) {
                try {
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                         throw new Error("Camera API not supported");
                    }
                    
                    let stream: MediaStream;
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ 
                            video: { 
                                facingMode: 'environment',
                                width: { ideal: 1920 },
                                height: { ideal: 1080 } 
                            } 
                        });
                    } catch (e) {
                         console.warn("High-res camera failed, trying default.", e);
                         stream = await navigator.mediaDevices.getUserMedia({ 
                            video: { facingMode: 'environment' } 
                        });
                    }

                    if (isMounted && isCameraOpen) {
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                        }
                        streamRef.current = stream;
                    } else {
                        stream.getTracks().forEach(track => track.stop());
                    }
                } catch (err: any) {
                    console.error("Error accessing camera:", err);
                    if (isMounted) {
                        setError(t('fileUpload.camera.error'));
                        setIsCameraOpen(false); 
                    }
                }
            }
        };

        if (isCameraOpen) {
            initCamera();
        } else {
            stopCamera();
        }

        return () => {
            isMounted = false;
            stopCamera();
        };
    }, [isCameraOpen, t]);
    
    // Processed Results for Archive (Sort & Filter)
    const processedArchiveResults = useMemo(() => {
        const query = archiveSearchQuery.toLowerCase().trim();
        let results = [...archivedResults];

        // Filter
        if (query) {
            results = results.filter(result =>
                result.studentName.toLowerCase().includes(query) ||
                result.studentGroup.toLowerCase().includes(query) ||
                new Date(result.timestamp || result.id).toLocaleDateString().includes(query) // Use timestamp fallback
            );
        }

        // Sort based on the submission timestamp (result.timestamp) or ID if missing
        results.sort((a, b) => {
            const dateA = new Date(a.timestamp || a.id).getTime();
            const dateB = new Date(b.timestamp || b.id).getTime();
            return archiveSortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

        return results;
    }, [archivedResults, archiveSearchQuery, archiveSortOrder]);

    const resultsByGroup = useMemo(() => {
        return processedArchiveResults.reduce((acc, result) => {
            const group = result.studentGroup || t('archive.unspecifiedGroup');
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push(result);
            return acc;
        }, {} as Record<string, GradingResult[]>);
    }, [processedArchiveResults, t]);

    const ScoreCircle = ({ score, total }: { score: number, total: number }) => {
        const percentage = total > 0 ? (score / total) * 100 : 0;
        let colorClass = 'text-green-600 bg-green-50 ring-green-500/30 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-400/30';
        if (percentage < 75) colorClass = 'text-yellow-600 bg-yellow-50 ring-yellow-500/30 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-400/30';
        if (percentage < 50) colorClass = 'text-red-600 bg-red-50 ring-red-500/30 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-400/30';

        return (
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl flex-shrink-0 ring-1 ${colorClass}`}>
                {score}
            </div>
        );
    };

    const renderStep = () => {
        switch (step) {
            case 'studentInfo':
                return (
                    <div className="w-full max-w-lg mx-auto">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center transition-all duration-300">
                            <div className="mb-6 flex justify-center">
                                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-2xl">
                                    <FileTextIcon className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                                </div>
                            </div>
                            <h2 className="text-3xl font-bold mb-3 text-gray-900 dark:text-white tracking-tight">{t('studentInfo.title')}</h2>
                            <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">{t('studentInfo.subtitle')}</p>
                            
                            <form onSubmit={handleStudentInfoSubmit} className="space-y-5 text-left rtl:text-right">
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 px-1">{t('studentInfo.namePlaceholder')}</label>
                                    <input
                                        type="text"
                                        value={studentName}
                                        onChange={(e) => {
                                            setStudentName(e.target.value);
                                            if (formError) setFormError(null);
                                        }}
                                        placeholder="Ex: John Doe"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        required
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 px-1">{t('studentInfo.groupPlaceholder')}</label>
                                    {availableGroups.length > 0 ? (
                                        <div className="relative">
                                             <select
                                                value={studentGroup}
                                                onChange={(e) => {
                                                    setStudentGroup(e.target.value);
                                                    if (formError) setFormError(null);
                                                }}
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all appearance-none"
                                                required
                                            >
                                                {availableGroups.map(group => (
                                                    <option key={group} value={group}>{group}</option>
                                                ))}
                                            </select>
                                            <div className="absolute top-1/2 -translate-y-1/2 ltr:right-4 rtl:left-4 pointer-events-none text-gray-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </div>
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={studentGroup}
                                            onChange={(e) => {
                                                setStudentGroup(e.target.value);
                                                if (formError) setFormError(null);
                                            }}
                                            placeholder="Ex: Group A"
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                            required
                                        />
                                    )}
                                </div>

                                <div className="space-y-1">
                                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 px-1">{t('studentInfo.marksPlaceholder')}</label>
                                    <input
                                        type="number"
                                        value={totalMarks}
                                        onChange={(e) => {
                                            setTotalMarks(Number(e.target.value));
                                            if (formError) setFormError(null);
                                        }}
                                        placeholder="20"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-gray-400"
                                        required
                                        min="1"
                                    />
                                </div>
                                
                                {formError && (
                                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 rounded-xl flex items-center gap-3 animate-fade-in">
                                        <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
                                        <p className="text-sm font-medium">{formError}</p>
                                    </div>
                                )}
                                
                                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-lg mt-4">
                                    {t('common.next')}
                                </button>
                            </form>
                        </div>
                    </div>
                );
            case 'fileUpload':
                const currentReference = examReferences[studentGroup];
                return (
                    <div className="w-full max-w-4xl mx-auto">
                        <div className="text-center mb-8">
                             <h2 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">{t('fileUpload.title')}</h2>
                             <p className="text-gray-500 dark:text-gray-400">{t('fileUpload.subtitle')}</p>
                        </div>

                        {/* Exam Reference Section */}
                        <div className="mb-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300">
                             <div className="p-6 border-b border-gray-100 dark:border-gray-700/50 flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                        <CheckIcon className="w-5 h-5" />
                                    </div>
                                    <div className="ltr:text-left rtl:text-right">
                                        <h3 className="font-bold text-gray-900 dark:text-white text-base">{t('fileUpload.reference.title', { studentGroup: studentGroup })}</h3>
                                        {currentReference ? (
                                            <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-0.5 flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                                                 {currentReference.type === 'files' 
                                                        ? t('fileUpload.reference.selectedFiles') + ` (${(currentReference.content as File[]).length})`
                                                        : t('fileUpload.reference.textType', { count: (currentReference.content as string).length })
                                                    }
                                            </p>
                                        ) : (
                                            <p className="text-sm text-gray-500 mt-0.5">{t('fileUpload.reference.none')}</p>
                                        )}
                                    </div>
                                </div>
                                
                                {!showReferenceEditor && (
                                     <div className="flex gap-3 w-full md:w-auto">
                                        {currentReference && (
                                            <button onClick={handleRemoveReference} className="flex-1 md:flex-none px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                                                {t('common.remove')}
                                            </button>
                                        )}
                                        <button onClick={handleOpenReferenceEditor} className={`flex-1 md:flex-none px-5 py-2 text-sm font-semibold rounded-lg transition-all shadow-sm ${currentReference ? 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600' : 'text-white bg-indigo-600 hover:bg-indigo-700'}`}>
                                            {currentReference ? t('common.change') : t('fileUpload.reference.add')}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {showReferenceEditor && (
                                <div className="p-6 bg-gray-50 dark:bg-gray-800/50 animate-fade-in">
                                    <div className="max-w-xl mx-auto space-y-5">
                                        <div className="flex p-1 bg-gray-200 dark:bg-gray-700 rounded-xl">
                                            <button onClick={() => setReferenceInputType('files')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${referenceInputType === 'files' ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>{t('fileUpload.reference.uploadFile')}</button>
                                            <button onClick={() => setReferenceInputType('text')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${referenceInputType === 'text' ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>{t('fileUpload.reference.enterText')}</button>
                                        </div>
                                        
                                        {referenceInputType === 'files' ? (
                                            <div className="space-y-4">
                                                <div 
                                                    onClick={() => referenceFileInputRef.current?.click()}
                                                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all flex flex-col items-center gap-3 group"
                                                >
                                                    <input type="file" accept="image/*,application/pdf" ref={referenceFileInputRef} onChange={(e) => addReferenceFilesToState(Array.from(e.target.files || []))} className="hidden" multiple />
                                                    <div className="p-3 bg-white dark:bg-gray-700 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                                        <UploadIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                                                    </div>
                                                    <div className="text-center">
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{t('fileUpload.reference.selectFiles')}</p>
                                                        <p className="text-xs text-gray-500 mt-1">{t('fileUpload.dragAndDrop')}</p>
                                                    </div>
                                                </div>
                                                 <button onClick={() => handleOpenCamera('reference')} type="button" className="w-full flex items-center justify-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 py-3 rounded-xl transition-all">
                                                    <CameraIcon className="w-5 h-5" />
                                                    {t('fileUpload.useCamera')}
                                                </button>
                                                
                                                {referenceFiles.length > 0 && (
                                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
                                                        {referenceFiles.map((file, idx) => (
                                                            <div key={idx} className="relative group bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden aspect-square border border-gray-200 dark:border-gray-700 shadow-sm">
                                                                 {file.file.type.startsWith('image/') ? (
                                                                    <img src={file.previewUrl} alt="ref" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                                                                         <FileTextIcon className="w-6 h-6 text-gray-400 mb-1" />
                                                                         <span className="text-[10px] text-gray-500 leading-tight line-clamp-2">{file.file.name}</span>
                                                                    </div>
                                                                )}
                                                                <button onClick={() => handleRemoveReferenceFile(idx)} className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-700 shadow-sm">
                                                                    <XCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <textarea value={referenceText} onChange={(e) => setReferenceText(e.target.value)} rows={6} placeholder={t('fileUpload.reference.textPlaceholder')} className="w-full p-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-gray-400 text-sm"></textarea>
                                        )}
                                        <div className="flex gap-3 justify-end pt-2">
                                            <button onClick={() => setShowReferenceEditor(false)} className="px-5 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">{t('common.cancel')}</button>
                                            <button onClick={handleSetReference} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">{t('fileUpload.reference.setReference')}</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Student File Upload Area */}
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
                             <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm">1</span>
                                    {t('fileUpload.title')}
                                </h3>
                                 <span className="text-sm text-gray-500">{examFiles.length} {t('fileUpload.selectedFiles')}</span>
                             </div>

                             {/* Manual Timestamp Input */}
                             <div className="mb-6 bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                                    <ClockIcon className="w-4 h-4 text-blue-500" />
                                    {t('fileUpload.submissionTimeLabel')}
                                </label>
                                <input
                                    type="datetime-local"
                                    value={submissionTime}
                                    onChange={(e) => setSubmissionTime(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition text-sm text-gray-800 dark:text-gray-200"
                                />
                             </div>

                            <div 
                                className={`relative border-2 border-dashed rounded-2xl p-10 transition-all duration-300 ease-in-out ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 scale-[0.99]' : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                                onDrop={handleDrop}
                                onDragOver={handleDragEvents}
                                onDragLeave={handleDragEvents}
                            >
                                <input type="file" accept="image/*,application/pdf" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
                                <div className="flex flex-col items-center justify-center space-y-5">
                                    <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                                        <UploadIcon className="w-10 h-10 text-blue-500 dark:text-blue-400" />
                                    </div>
                                    <div className="text-center">
                                         <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                            <button type="button" onClick={() => fileInputRef.current?.click()} className="text-blue-600 dark:text-blue-400 hover:underline decoration-2 underline-offset-2">{t('fileUpload.dragAndDrop').split(',')[0]}</button> 
                                            <span className="text-gray-500 dark:text-gray-400 font-normal"> {t('fileUpload.dragAndDrop').split(',')[1]}</span>
                                        </p>
                                        <p className="text-sm text-gray-400 mt-2">{t('fileUpload.optimizationNote')}</p>
                                    </div>
                                    <div className="flex items-center gap-3 w-full max-w-xs">
                                        <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                                        <span className="text-xs text-gray-400 uppercase font-medium">OR</span>
                                        <div className="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                                    </div>
                                    <button onClick={() => handleOpenCamera('student')} type="button" className="flex items-center gap-2.5 text-sm font-bold text-gray-700 dark:text-white bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 px-6 py-3 rounded-xl transition-all">
                                        <CameraIcon className="w-5 h-5" />
                                        {t('fileUpload.useCamera')}
                                    </button>
                                </div>
                            </div>

                            {examFiles.length > 0 && (
                                <div className="mt-8 animate-fade-in">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                                        {examFiles.map((examFile, index) => (
                                            <div key={index} className="relative group bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden aspect-[3/4] border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
                                                {examFile.file.type.startsWith('image/') ? (
                                                    <img src={examFile.previewUrl} alt="preview" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"/>
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center">
                                                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-2">
                                                            <FileTextIcon className="w-6 h-6 text-red-500" />
                                                        </div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 break-all line-clamp-3">{examFile.file.name}</span>
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button onClick={() => handleRemoveFile(index)} className="p-2.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-transform hover:scale-110 shadow-lg" title={t('common.remove')}>
                                                        <TrashIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                                <div className="absolute bottom-2 left-2 right-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                     <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">Page {index + 1}</span>
                                                </div>
                                            </div>
                                        ))}
                                        <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center aspect-[3/4] border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-gray-400 hover:text-blue-500 group">
                                            <PlusCircleIcon className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                                            <span className="text-xs font-bold">Add Page</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-r-xl text-red-700 dark:text-red-300 flex items-start gap-4 animate-fade-in shadow-sm">
                                <AlertTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-sm uppercase tracking-wide opacity-80 mb-1">{t('common.errorTitle')}</h4>
                                    <p className="font-medium">{error}</p>
                                </div>
                            </div>
                        )}
                        
                        <div className="mt-8 flex flex-col sm:flex-row gap-4">
                             <button onClick={() => setStep('studentInfo')} className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
                                {t('common.back')}
                            </button>
                            <button onClick={handleGradeExam} disabled={examFiles.length === 0} className="flex-1 bg-blue-600 text-white font-bold py-4 px-8 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 transform hover:-translate-y-0.5 active:translate-y-0 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2">
                                <span>{t('fileUpload.gradeButton', { count: examFiles.length })}</span>
                                {examFiles.length > 0 && <svg className="w-5 h-5 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>}
                            </button>
                        </div>
                    </div>
                );
            case 'grading':
                return <Loader messageKey="loader.message" />;
            case 'results':
                return gradingResult && (
                    <div className="w-full max-w-6xl mx-auto">
                        <ResultsDisplay
                            result={gradingResult}
                            graderName={settings.graderName}
                            notification={notification}
                            onRestore={penalizedArchiveEntry ? handleRestoreArchivedResult : undefined}
                        />
                        <div className="mt-8 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sticky bottom-6 z-20 backdrop-blur-md bg-opacity-95 dark:bg-opacity-95">
                             <button onClick={handleArchiveResult} className="flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-green-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                                <ArchiveIcon className="w-5 h-5"/> {t('results.archiveButton')}
                            </button>
                            <button onClick={handleGradeNextInGroup} className="flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                                <PlusCircleIcon className="w-5 h-5"/> {t('results.gradeNextButton')}
                            </button>
                             <button onClick={handleRegrade} className="flex items-center justify-center gap-2 bg-amber-500 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-amber-600 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                                <RefreshIcon className="w-5 h-5"/> {t('results.regradeButton')}
                            </button>
                             <button onClick={handleReset} className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold py-3.5 px-4 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                {t('results.resetButton')}
                            </button>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };
    
    const renderArchive = () => {
        if (viewingArchivedResult) {
            return (
                <div className="w-full max-w-6xl mx-auto">
                    <ResultsDisplay result={viewingArchivedResult} graderName={settings.graderName} />
                    <div className="mt-8 flex justify-center">
                        <button 
                            onClick={() => setViewingArchivedResult(null)} 
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold py-3 px-8 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                        >
                            {t('archive.backToArchive')}
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full max-w-6xl mx-auto">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{t('archive.title')}</h2>
                        <p className="text-gray-500 mt-1">{t('archive.studentCount', { count: archivedResults.length })}</p>
                    </div>
                    {archivedResults.length > 0 && (
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={handleExportArchive} 
                                className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                                disabled={!!exportProgress}
                            >
                                <DownloadIcon className="w-5 h-5" />
                                {exportProgress ? exportProgress : t('archive.exportButton')}
                            </button>
                            <button onClick={handleClearArchive} className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-bold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">
                                <TrashIcon className="w-5 h-5" />
                                {t('archive.clearButton')}
                            </button>
                        </div>
                    )}
                </div>

                {archivedResults.length > 0 && (
                     <div className="mb-8 flex flex-col md:flex-row gap-4">
                        <div className="relative group flex-grow">
                            <div className="absolute inset-y-0 ltr:left-0 rtl:right-0 ltr:pl-4 rtl:pr-4 flex items-center pointer-events-none">
                                <SearchIcon className="w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                value={archiveSearchQuery}
                                onChange={(e) => setArchiveSearchQuery(e.target.value)}
                                placeholder={t('archive.searchPlaceholder')}
                                className="w-full pl-12 pr-4 rtl:pl-4 rtl:pr-12 py-4 bg-white dark:bg-gray-800 border-none shadow-sm rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder-gray-400 text-lg"
                            />
                        </div>
                        <div className="relative min-w-[200px]">
                            <div className="absolute inset-y-0 ltr:left-0 rtl:right-0 ltr:pl-4 rtl:pr-4 flex items-center pointer-events-none">
                                <SortIcon className="w-5 h-5 text-gray-400" />
                            </div>
                            <select
                                value={archiveSortOrder}
                                onChange={(e) => setArchiveSortOrder(e.target.value as 'newest' | 'oldest')}
                                className="w-full pl-12 pr-10 rtl:pl-10 rtl:pr-12 py-4 bg-white dark:bg-gray-800 border-none shadow-sm rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all appearance-none cursor-pointer text-gray-700 dark:text-gray-200"
                            >
                                <option value="newest">{t('archive.sortNewest')}</option>
                                <option value="oldest">{t('archive.sortOldest')}</option>
                            </select>
                            <div className="absolute inset-y-0 ltr:right-0 rtl:left-0 ltr:pr-4 rtl:pl-4 flex items-center pointer-events-none text-gray-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal for Group Analytics */}
                {selectedAnalyticsGroup && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={() => setSelectedAnalyticsGroup(null)}>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('archive.analytics.title', { groupName: selectedAnalyticsGroup })}</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('archive.analytics.students', { count: resultsByGroup[selectedAnalyticsGroup]?.length || 0 })}</p>
                                </div>
                                <button onClick={() => setSelectedAnalyticsGroup(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500">
                                    <XCircleIcon className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/30">
                                <GroupAnalytics results={resultsByGroup[selectedAnalyticsGroup] || []} groupName={selectedAnalyticsGroup} />
                            </div>
                            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                                <button onClick={() => setSelectedAnalyticsGroup(null)} className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold rounded-xl transition-colors">
                                    {t('common.close')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {Object.keys(resultsByGroup).length > 0 ? (
                    <div className="space-y-8">
                        {Object.keys(resultsByGroup).map((group) => (
                            <div key={group} className="animate-fade-in">
                                <div className="flex items-center gap-3 mb-4 bg-gray-100 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700 justify-between flex-wrap">
                                     <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200">{group} <span className="text-sm bg-white dark:bg-gray-700 px-2 py-0.5 rounded-md text-gray-500 ml-2 shadow-sm border border-gray-200 dark:border-gray-600">({resultsByGroup[group].length})</span></h3>
                                     </div>
                                     <div className="flex gap-2">
                                        <button 
                                            onClick={() => setSelectedAnalyticsGroup(group)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold text-sm rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                        >
                                            <ChartBarIcon className="w-4 h-4" />
                                            {t('archive.analytics.button')}
                                        </button>
                                        <button 
                                            onClick={() => handleExportGroupExcel(group, resultsByGroup[group])}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold text-sm rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                                        >
                                            <TableCellsIcon className="w-4 h-4" />
                                            {t('archive.analytics.exportExcel')}
                                        </button>
                                     </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {resultsByGroup[group].map(res => (
                                        <div key={res.id} onClick={() => handleViewArchivedResult(res)} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 transition-all hover:shadow-md hover:-translate-y-1 cursor-pointer group relative overflow-hidden">
                                            <div className="absolute top-0 ltr:right-0 rtl:left-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                 <button onClick={(e) => { e.stopPropagation(); handleRegradeFromArchive(res); }} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-blue-100 text-gray-500 hover:text-blue-600 transition-colors"><RefreshIcon className="w-4 h-4" /></button>
                                                 <button onClick={(e) => { e.stopPropagation(); handleDeleteArchivedResult(res.id); }} className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                            <ScoreCircle score={res.score} total={res.totalMarks} />
                                            <div className="flex-grow min-w-0">
                                                <p className="font-bold text-lg truncate group-hover:text-blue-600 transition-colors">{res.studentName}</p>
                                                <div className="flex flex-col gap-1 mt-1">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                                        <ClockIcon className="w-3.5 h-3.5 opacity-70" />
                                                        {/* Use the specific timestamp if available, else fallback to id */}
                                                        {new Date(res.timestamp || res.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </p>
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                                        {new Date(res.timestamp || res.id).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                        <div className="inline-block p-4 bg-gray-50 dark:bg-gray-700/50 rounded-full mb-4">
                            <SearchIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                            {archiveSearchQuery ? t('archive.noResultsForQuery', { query: archiveSearchQuery }) : t('archive.noResults')}
                        </h3>
                        <p className="text-gray-500 text-sm">No exam results found in the archive.</p>
                    </div>
                )}
                 <button onClick={() => setShowArchive(false)} className="mt-8 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold py-4 px-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm">
                    {t('archive.backToGrading')}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900/95 text-gray-800 dark:text-gray-200 font-sans transition-colors duration-300">
            <SettingsModal 
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onSave={handleSaveSettings}
                currentSettings={settings}
            />
            {isCameraOpen && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col" role="dialog" aria-modal="true">
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/70 to-transparent">
                         <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/20">
                            <p className="text-xs font-medium text-white tracking-wide">
                                {cameraTarget === 'student' ? t('fileUpload.title') : t('fileUpload.reference.title', {studentGroup})}
                            </p>
                         </div>
                         <button onClick={handleCloseCamera} className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors border border-white/20">
                            <XCircleIcon className="w-6 h-6" />
                         </button>
                    </div>
                    
                    <div className="flex-grow relative flex items-center justify-center bg-black overflow-hidden">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain max-h-[85vh]"></video>
                        {lastCaptureTime && (
                            <div className="absolute inset-0 bg-white opacity-80 animate-ping pointer-events-none duration-100"></div>
                        )}
                        <div className="absolute inset-0 pointer-events-none border-2 border-white/10 m-8 rounded-3xl"></div> {/* Safe area guide */}
                    </div>
                    
                    <div className="bg-black/90 backdrop-blur-xl p-6 sm:p-8 flex flex-col gap-6 safe-area-bottom">
                         {cameraTarget === 'student' && examFiles.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto pb-2 w-full justify-center no-scrollbar">
                                {examFiles.map((file, idx) => (
                                    <div key={idx} className="relative w-12 h-16 flex-shrink-0 rounded-lg overflow-hidden border border-white/20 shadow-md">
                                        {file.previewUrl ? (
                                            <img src={file.previewUrl} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                                <FileTextIcon className="w-5 h-5 text-white/50" />
                                            </div>
                                        )}
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center py-0.5">{idx + 1}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center justify-between max-w-lg mx-auto w-full">
                            <div className="w-12"></div> {/* Spacer for balance */}
                            <button onClick={handleCapture} className="group relative" aria-label={t('fileUpload.camera.capture')}>
                                <div className="w-20 h-20 rounded-full border-4 border-white/80 flex items-center justify-center group-active:border-white transition-colors">
                                    <div className="w-16 h-16 rounded-full bg-white group-active:scale-90 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.5)]"></div>
                                </div>
                            </button>
                            <button onClick={handleCloseCamera} className="w-12 h-12 flex items-center justify-center text-white font-bold text-sm bg-white/10 rounded-full backdrop-blur-md">
                                {t('fileUpload.camera.done')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {installPromptEvent && !isStandalone && !pwaInstallDismissed && (
                <PWAInstallBanner 
                    onInstall={handleInstallApp} 
                    onDismiss={handleDismissInstall} 
                />
            )}
            <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 transition-colors duration-300">
                <nav className="container mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={handleReset}>
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
                            <span className="text-white font-bold text-lg">AI</span>
                        </div>
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight hidden sm:block">{t('app.title')}</h1>
                    </div>
                    
                    <div className="flex items-center gap-2 sm:gap-3 bg-gray-100 dark:bg-gray-700/50 p-1 rounded-full">
                        <LanguageToggle />
                        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <ThemeToggle />
                        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                        <button onClick={() => {
                                setShowArchive(s => !s);
                                if (showArchive) {
                                    setViewingArchivedResult(null);
                                    setArchiveSearchQuery(''); 
                                }
                            }} 
                            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${showArchive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400'}`}
                        >
                            {showArchive ? t('app.header.closeArchive') : t('app.header.viewArchive', { count: archivedResults.length })}
                        </button>
                        <button onClick={() => setShowSettings(true)} title={t('app.header.settings')} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 rounded-full transition-all shadow-sm hover:shadow">
                            <SettingsIcon className="w-5 h-5" />
                        </button>
                    </div>
                </nav>
            </header>
            <main className="flex-grow container mx-auto px-4 sm:px-6 py-8 sm:py-12 flex items-start justify-center">
                <div key={showArchive ? (viewingArchivedResult ? viewingArchivedResult.id : 'archive') : step} className="w-full animate-fade-in-up">
                    {showArchive ? renderArchive() : renderStep()}
                </div>
            </main>
            <footer className="w-full py-6 text-center border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-gray-500 dark:text-gray-400">
                <p>{t('app.footer.credit')} &copy; {new Date().getFullYear()}</p>
                { (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
                    <button onClick={handleRunTests} className="mt-2 text-xs text-blue-500 hover:underline opacity-50 hover:opacity-100">
                        Run Diagnostics
                    </button>
                }
            </footer>
        </div>
    );
};

export default App;
