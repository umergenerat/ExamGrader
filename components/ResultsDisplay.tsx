
import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { GradingResult, WebPlagiarismSource } from '../types';
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, DownloadIcon, RefreshIcon, ShareIcon, CheckIcon } from './icons';
import { useAppContext } from '../context/AppContext';

interface ResultsDisplayProps {
  result: GradingResult;
  graderName?: string;
  notification?: string | null;
  onRestore?: () => void;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, graderName, notification, onRestore }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const displayRef = useRef<HTMLDivElement>(null);
  const printReportRef = useRef<HTMLDivElement>(null);
  
  const { t, language } = useAppContext();

  const scorePercentage = (result.score / result.totalMarks) * 100;

  const renderAnswerWithPlagiarism = (answer: string, webSources?: WebPlagiarismSource[]): React.ReactNode => {
    if (!webSources || webSources.length === 0) {
        return <span className="text-gray-800 dark:text-gray-200 leading-relaxed">{answer}</span>;
    }

    const relevantSources = webSources.filter(source => 
        answer.toLowerCase().includes(source.studentText.toLowerCase())
    );

    if (relevantSources.length === 0) {
        return <span className="text-gray-800 dark:text-gray-200 leading-relaxed">{answer}</span>;
    }

    let content: (string | React.ReactNode)[] = [answer];

    relevantSources.forEach(source => {
        let newContent: (string | React.ReactNode)[] = [];
        content.forEach((part, partIndex) => {
            if (typeof part === 'string') {
                const escapedText = source.studentText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`(${escapedText})`, 'gi');
                const subParts = part.split(regex);
                
                subParts.forEach((subPart, subIndex) => {
                    if (subPart.toLowerCase() === source.studentText.toLowerCase()) {
                        newContent.push(
                            <a 
                                key={`${partIndex}-${subIndex}`}
                                href={source.sourceUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium px-1 rounded hover:bg-red-200 cursor-pointer border-b-2 border-red-300 dark:border-red-700"
                                title={`${t('results.plagiarismSource')}: ${source.sourceUrl}`}
                                onClick={(e) => e.stopPropagation()} 
                            >
                                {subPart}
                            </a>
                        );
                    } else {
                        newContent.push(subPart);
                    }
                });
            } else {
                newContent.push(part);
            }
        });
        content = newContent;
    });

    return <span className="text-gray-800 dark:text-gray-200 leading-relaxed">{content.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>)}</span>;
  };
  
  const captureAndExport = async (action: 'download' | 'share') => {
      const element = printReportRef.current;
      if (!element) return;
      
      const setActionState = action === 'download' ? setIsExporting : setIsSharing;
      setActionState(true);

      try {
        const originalDir = document.documentElement.dir;
        // Enforce direction for the PDF render based on language
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

        // 1. Capture the element at high resolution
        const canvas = await html2canvas(element, {
            scale: 2, // High resolution for clear text
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 1200 // Ensure consistent rendering width
        });
        
        document.documentElement.dir = originalDir;

        // 2. Calculate PDF dimensions (A4)
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = 595.28; // A4 width in pt (approx 210mm)
        const pageHeight = 841.89; // A4 height in pt (approx 297mm)
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;

        const pdf = new jsPDF('p', 'pt', 'a4');

        // 3. Add first page
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // 4. Add subsequent pages if content is long (Multi-page logic)
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        const fileName = `${t('results.pdfFileNamePrefix')}-${result.studentName.replace(/\s/g, '_')}.pdf`;

        if (action === 'download') {
             pdf.save(fileName);
        } else {
             const pdfBlob = pdf.output('blob');
             const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
             
             const shareData = {
                files: [pdfFile],
                title: t('results.shareTitle', { studentName: result.studentName }),
                text: t('results.shareText'),
             };

             if (navigator.canShare && navigator.canShare(shareData)) {
                 await navigator.share(shareData);
             } else {
                 alert(t('results.shareError'));
             }
        }

      } catch (error) {
          if ((error as DOMException)?.name !== 'AbortError') {
              console.error(`Error during ${action}:`, error);
              alert(t('results.exportError'));
          }
      } finally {
          setActionState(false);
      }
  };


  return (
    <div className="animate-fade-in relative space-y-6 sm:space-y-8">
        {notification && (
            <div className="p-4 sm:p-5 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-xl shadow-sm text-amber-900 dark:text-amber-100 animate-fade-in" role="alert">
                <div className="flex items-start gap-3 sm:gap-4">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full">
                         <AlertTriangleIcon className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400 flex-shrink-0"/>
                    </div>
                    <div className="flex-grow">
                        <p className="font-bold text-base sm:text-lg mb-1">{t('results.autoActionNotice')}</p>
                        <p className="leading-relaxed opacity-90 text-sm sm:text-base">{notification}</p>
                        {onRestore && (
                            <button
                                onClick={onRestore}
                                title={t('results.restoreButtonTitle')}
                                className="mt-4 flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-blue-900/40 hover:bg-blue-50 dark:hover:bg-blue-800 transition-colors px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm"
                            >
                                <RefreshIcon className="w-4 h-4" />
                                <span>{t('results.restoreButton')}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )}
        
        {/* Actions Bar */}
        <div className="flex justify-end gap-3 print:hidden">
            <button 
                onClick={() => captureAndExport('download')}
                disabled={isExporting || isSharing}
                className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold py-2 sm:py-2.5 px-4 sm:px-5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm disabled:opacity-50 text-sm sm:text-base"
            >
                <DownloadIcon className="w-4 h-4" />
                {isExporting ? t('results.exporting') : t('results.exportToPdf')}
            </button>
            <button 
                onClick={() => captureAndExport('share')}
                disabled={isSharing || isExporting}
                className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 sm:py-2.5 px-4 sm:px-5 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 dark:shadow-none disabled:opacity-50 text-sm sm:text-base"
            >
                <ShareIcon className="w-4 h-4" />
                {isSharing ? t('results.sharing') : t('results.shareWithStudent')}
            </button>
        </div>

        {/* Dashboard Display (Screen View) */}
        <div ref={displayRef} className="space-y-4 sm:space-y-6">
          
          {/* Hero Section: Score & Integrity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Score Card */}
            <div className={`md:col-span-2 p-4 sm:p-6 rounded-2xl border shadow-sm flex flex-col justify-center items-center md:items-start relative overflow-hidden bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700`}>
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 -mr-10 -mt-10 ${scorePercentage >= 75 ? 'bg-green-500' : scorePercentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                
                <h2 className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider text-xs sm:text-sm mb-2">{t('results.title')}</h2>
                <div className="flex flex-col md:flex-row items-center gap-6 w-full z-10">
                     <div className="text-center md:text-left rtl:md:text-right">
                         <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1">{result.studentName}</h1>
                         <p className="text-gray-500 dark:text-gray-400 font-medium bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full inline-block text-sm">{result.studentGroup}</p>
                     </div>
                     <div className="flex-grow"></div>
                     <div className="flex items-center gap-4">
                         <div className="text-right rtl:text-left">
                            <span className="block text-xs text-gray-400 uppercase font-bold">{t('studentInfo.marksPlaceholder')}</span>
                            <span className="text-4xl font-black text-gray-900 dark:text-white">{result.score}</span>
                            <span className="text-xl text-gray-400 font-medium">/{result.totalMarks}</span>
                         </div>
                         <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                             <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path className="text-gray-200 dark:text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                <path className={`${scorePercentage >= 75 ? 'text-green-500' : scorePercentage >= 50 ? 'text-yellow-500' : 'text-red-500'} transition-all duration-1000 ease-out`} strokeDasharray={`${scorePercentage}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                            </svg>
                         </div>
                     </div>
                </div>
            </div>

            {/* Integrity Card */}
            <div className={`p-4 sm:p-6 rounded-2xl border shadow-sm flex flex-col justify-center ${result.cheatingAnalysis.detected || result.cheatingAnalysis.isAiGenerated ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50' : 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/50'}`}>
                 <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-full ${result.cheatingAnalysis.detected || result.cheatingAnalysis.isAiGenerated ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'bg-green-100 dark:bg-green-900/40 text-green-600'}`}>
                        {(result.cheatingAnalysis.detected || result.cheatingAnalysis.isAiGenerated) ? <AlertTriangleIcon className="w-6 h-6" /> : <CheckCircleIcon className="w-6 h-6" />}
                    </div>
                    <h3 className={`font-bold text-lg leading-tight ${(result.cheatingAnalysis.detected || result.cheatingAnalysis.isAiGenerated) ? 'text-red-800 dark:text-red-200' : 'text-green-800 dark:text-green-200'}`}>
                        {result.cheatingAnalysis.detected ? t('results.cheatingDetected') : 
                        result.cheatingAnalysis.isAiGenerated ? t('results.aiDetected') :
                        t('results.noCheatingDetected')}
                    </h3>
                 </div>
                 
                 {result.cheatingAnalysis.isAiGenerated && (
                    <div className="mb-3 text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded w-fit">
                        AI Content
                    </div>
                 )}
                 
                 <p className="text-sm opacity-90 leading-relaxed text-gray-700 dark:text-gray-300">
                     {result.cheatingAnalysis.reasoning.length > 100 
                        ? result.cheatingAnalysis.reasoning.substring(0, 100) + '...' 
                        : result.cheatingAnalysis.reasoning}
                 </p>
                 
                  {result.cheatingAnalysis.webSources && result.cheatingAnalysis.webSources.length > 0 && (
                     <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800/30">
                        <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase mb-1">{t('results.webSourcesTitle')}</p>
                        <div className="flex flex-wrap gap-2">
                            {result.cheatingAnalysis.webSources.slice(0, 2).map((s, i) => (
                                <a key={i} href={s.sourceUrl} target="_blank" className="text-xs bg-white dark:bg-black/20 px-2 py-1 rounded text-red-600 dark:text-red-400 truncate max-w-[120px] hover:underline block">{new URL(s.sourceUrl).hostname}</a>
                            ))}
                            {result.cheatingAnalysis.webSources.length > 2 && <span className="text-xs text-red-500 self-center">+{result.cheatingAnalysis.webSources.length - 2}</span>}
                        </div>
                     </div>
                 )}
            </div>
          </div>

          {/* Feedback Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center"><CheckIcon className="w-5 h-5" /></span>
                  {t('results.strengths')}
              </h3>
              <ul className="space-y-3">
                {result.strengths.map((strength, index) => (
                  <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-sm text-gray-700 dark:text-gray-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
                  <span className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center"><XCircleIcon className="w-5 h-5" /></span>
                  {t('results.weaknesses')}
              </h3>
              <ul className="space-y-3">
                {result.weaknesses.map((weakness, index) => (
                  <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-sm text-gray-700 dark:text-gray-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                    {weakness}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detailed Feedback List */}
          <div>
            <div className="flex items-center gap-4 mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('results.detailedFeedback')}</h3>
                <div className="h-px bg-gray-200 dark:bg-gray-700 flex-grow"></div>
            </div>
            
            <div className="space-y-4 sm:space-y-6">
              {result.detailedFeedback.map((item, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all hover:shadow-md">
                  <div className="bg-gray-50 dark:bg-gray-700/30 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start gap-4">
                    <h4 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg flex-1 leading-snug">{t('results.question')} {index + 1}: <span className="text-gray-600 dark:text-gray-300 font-medium text-sm sm:text-base ml-2">{item.question}</span></h4>
                    <div className="flex-shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-3 py-1 rounded-lg font-bold text-gray-900 dark:text-white shadow-sm text-sm">
                        {item.marksAwarded} <span className="text-gray-400 text-xs font-normal">/ {item.maxMarks}</span>
                    </div>
                  </div>
                  
                  <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                      {/* Student Answer */}
                      <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{t('results.studentAnswer')}</p>
                          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50 text-gray-800 dark:text-gray-200 leading-relaxed font-serif text-sm sm:text-base">
                             {renderAnswerWithPlagiarism(item.studentAnswer, result.cheatingAnalysis.webSources)}
                          </div>
                      </div>

                      {/* Ideal Answer & Evaluation */}
                      <div className="space-y-4 sm:space-y-6">
                           <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-2">{t('results.idealAnswer')}</p>
                              <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed italic border-l-2 border-green-200 dark:border-green-800 pl-3">
                                  {item.idealAnswer}
                              </div>
                           </div>
                           <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">{t('results.evaluation')}</p>
                              <div className="text-sm text-gray-800 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border-l-4 border-blue-500">
                                  {item.evaluation}
                              </div>
                           </div>
                      </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Improved Hidden Print Layout - Optimized for A4 Multi-page PDF */}
        <div 
          ref={printReportRef} 
          style={{
            position: 'absolute',
            left: '-9999px',
            top: 0,
            width: '210mm', // A4 Width
            minHeight: '297mm', // A4 Height
            backgroundColor: '#ffffff',
            color: '#000000', // Pure black for print
            padding: '15mm', // Standard print margins
            fontFamily: language === 'ar' ? 'Cairo, sans-serif' : 'Times New Roman, serif', // Formal fonts
            direction: language === 'ar' ? 'rtl' : 'ltr',
            boxSizing: 'border-box'
          }}
        >
            {/* Print Header */}
            <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold uppercase tracking-widest text-black">{t('results.officialReport')}</h1>
                    <p className="text-xs text-gray-600 mt-1 font-medium tracking-wide">AI EXAM GRADER SYSTEM • REF: {result.id.slice(-8)}</p>
                </div>
                <div className="text-right rtl:text-left">
                    <h2 className="text-xl font-bold text-black">{result.studentName}</h2>
                    <p className="text-gray-700 font-medium text-sm">{result.studentGroup}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(result.id).toLocaleDateString()} {new Date(result.id).toLocaleTimeString()}</p>
                </div>
            </div>

            {/* Print Score Summary Block */}
            <div className="flex gap-4 mb-6">
                 <div className="flex-1 bg-gray-50 p-4 rounded border border-gray-300">
                     <p className="text-xs font-bold uppercase text-gray-500 mb-1">{t('studentInfo.marksPlaceholder')}</p>
                     <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-black">{result.score}</span>
                        <span className="text-xl font-medium text-gray-600">/ {result.totalMarks}</span>
                     </div>
                 </div>
                 <div className={`flex-1 p-4 rounded border flex flex-col justify-center items-center text-center ${result.cheatingAnalysis.detected ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-300'}`}>
                    <p className={`text-base font-bold ${result.cheatingAnalysis.detected ? 'text-red-700' : 'text-gray-700'}`}>
                        {result.cheatingAnalysis.detected ? t('results.cheatingDetected') : t('results.noCheatingDetected')}
                    </p>
                    {result.cheatingAnalysis.isAiGenerated && (
                        <p className="text-xs font-bold text-red-600 mt-1">[AI DETECTED]</p>
                    )}
                 </div>
            </div>

            {/* Print Detailed Table */}
            <div>
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-gray-100 border-b-2 border-black text-gray-700">
                            <th className="py-2 px-3 text-left rtl:text-right font-bold w-10 border-r border-gray-300">#</th>
                            <th className="py-2 px-3 text-left rtl:text-right font-bold">{t('results.detailedFeedback')}</th>
                            <th className="py-2 px-3 text-center font-bold w-20 border-l border-gray-300">{t('studentInfo.marksPlaceholder')}</th>
                        </tr>
                    </thead>
                    <tbody className="text-black">
                        {result.detailedFeedback.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-300">
                                <td className="py-3 px-3 align-top font-bold text-gray-500 border-r border-gray-200">{idx + 1}</td>
                                <td className="py-3 px-3 align-top">
                                    <div className="mb-2 font-bold text-base text-black underline">{item.question}</div>
                                    <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200 text-xs">
                                        <span className="block font-bold text-gray-500 uppercase mb-0.5">{t('results.studentAnswer')}:</span>
                                        {item.studentAnswer}
                                    </div>
                                    <div className="text-gray-700 italic text-xs pl-2 rtl:pl-0 rtl:pr-2 border-l-2 rtl:border-l-0 rtl:border-r-2 border-gray-400">
                                        {item.evaluation}
                                    </div>
                                </td>
                                <td className="py-3 px-3 align-top text-center font-bold text-base border-l border-gray-200">
                                    {item.marksAwarded}
                                    <span className="block text-[10px] text-gray-400 font-normal">/ {item.maxMarks}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Space Filler to push signature to bottom if page allows, otherwise simple margin */}
            <div className="mt-8 mb-4"></div>

            {/* Print Footer / Signature Section */}
            <div className="border-t-2 border-black pt-4 flex justify-between items-end break-inside-avoid">
                <div className="text-[10px] text-gray-500">
                    <p>Generated by AI Exam Grader</p>
                    <p>{new Date().toLocaleString()}</p>
                </div>
                
                {/* Formal Signature Box */}
                <div className="text-center w-64">
                    <p className="font-bold text-xs uppercase tracking-wider mb-8 text-black">{t('results.graderSignature')}</p>
                    <div className="border-b border-black mb-2"></div>
                    {graderName ? (
                        <p className="text-xl font-serif font-bold italic text-black">{graderName}</p>
                    ) : (
                        <p className="text-sm text-gray-400 italic">(Signed Digitally)</p>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default ResultsDisplay;

