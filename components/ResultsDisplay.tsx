
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
  let scoreColorClass = 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400';
  if (scorePercentage < 75) scoreColorClass = 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400';
  if (scorePercentage < 50) scoreColorClass = 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400';

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
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 800, 
        });
        
        document.documentElement.dir = originalDir;

        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'px',
            format: [canvas.width, canvas.height],
            hotfixes: ['px_scaling'],
        });
        
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
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
    <div className="animate-fade-in relative space-y-8">
        {notification && (
            <div className="p-5 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-xl shadow-sm text-amber-900 dark:text-amber-100 animate-fade-in" role="alert">
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full">
                         <AlertTriangleIcon className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0"/>
                    </div>
                    <div className="flex-grow">
                        <p className="font-bold text-lg mb-1">{t('results.autoActionNotice')}</p>
                        <p className="leading-relaxed opacity-90">{notification}</p>
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
                className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold py-2.5 px-5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm disabled:opacity-50"
            >
                <DownloadIcon className="w-4 h-4" />
                {isExporting ? t('results.exporting') : t('results.exportToPdf')}
            </button>
            <button 
                onClick={() => captureAndExport('share')}
                disabled={isSharing || isExporting}
                className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 dark:shadow-none disabled:opacity-50"
            >
                <ShareIcon className="w-4 h-4" />
                {isSharing ? t('results.sharing') : t('results.shareWithStudent')}
            </button>
        </div>

        {/* Dashboard Display */}
        <div ref={displayRef} className="space-y-6">
          
          {/* Hero Section: Score & Integrity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score Card */}
            <div className={`md:col-span-2 p-6 rounded-2xl border shadow-sm flex flex-col justify-center items-center md:items-start relative overflow-hidden bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700`}>
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 -mr-10 -mt-10 ${scorePercentage >= 75 ? 'bg-green-500' : scorePercentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                
                <h2 className="text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider text-sm mb-2">{t('results.title')}</h2>
                <div className="flex flex-col md:flex-row items-center gap-6 w-full z-10">
                     <div className="text-center md:text-left rtl:md:text-right">
                         <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{result.studentName}</h1>
                         <p className="text-gray-500 dark:text-gray-400 font-medium bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full inline-block text-sm">{result.studentGroup}</p>
                     </div>
                     <div className="flex-grow"></div>
                     <div className="flex items-center gap-4">
                         <div className="text-right rtl:text-left">
                            <span className="block text-xs text-gray-400 uppercase font-bold">{t('studentInfo.marksPlaceholder')}</span>
                            <span className="text-4xl font-black text-gray-900 dark:text-white">{result.score}</span>
                            <span className="text-xl text-gray-400 font-medium">/{result.totalMarks}</span>
                         </div>
                         <div className="w-20 h-20 rounded-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                             <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                <path className="text-gray-200 dark:text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                <path className={`${scorePercentage >= 75 ? 'text-green-500' : scorePercentage >= 50 ? 'text-yellow-500' : 'text-red-500'} transition-all duration-1000 ease-out`} strokeDasharray={`${scorePercentage}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                            </svg>
                         </div>
                     </div>
                </div>
            </div>

            {/* Integrity Card */}
            <div className={`p-6 rounded-2xl border shadow-sm flex flex-col justify-center ${result.cheatingAnalysis.detected || result.cheatingAnalysis.isAiGenerated ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50' : 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/50'}`}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
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
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
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
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{t('results.detailedFeedback')}</h3>
                <div className="h-px bg-gray-200 dark:bg-gray-700 flex-grow"></div>
            </div>
            
            <div className="space-y-6">
              {result.detailedFeedback.map((item, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all hover:shadow-md">
                  <div className="bg-gray-50 dark:bg-gray-700/30 px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start gap-4">
                    <h4 className="font-bold text-gray-900 dark:text-white text-lg flex-1 leading-snug">{t('results.question')} {index + 1}: <span className="text-gray-600 dark:text-gray-300 font-medium text-base ml-2">{item.question}</span></h4>
                    <div className="flex-shrink-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-3 py-1 rounded-lg font-bold text-gray-900 dark:text-white shadow-sm">
                        {item.marksAwarded} <span className="text-gray-400 text-sm font-normal">/ {item.maxMarks}</span>
                    </div>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Student Answer */}
                      <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{t('results.studentAnswer')}</p>
                          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700/50 text-gray-800 dark:text-gray-200 leading-relaxed font-serif">
                             {renderAnswerWithPlagiarism(item.studentAnswer, result.cheatingAnalysis.webSources)}
                          </div>
                      </div>

                      {/* Ideal Answer & Evaluation */}
                      <div className="space-y-6">
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

        {/* Hidden Print Layout */}
        <div 
          ref={printReportRef} 
          style={{
            position: 'absolute',
            left: '-9999px',
            top: 0,
            width: '800px',
            backgroundColor: '#ffffff',
            color: '#1a1a1a',
            padding: '48px',
            fontFamily: language === 'ar' ? 'Cairo, sans-serif' : 'Inter, sans-serif',
            direction: language === 'ar' ? 'rtl' : 'ltr'
          }}
        >
            {/* Print Header */}
            <div className="flex justify-between items-end border-b-2 border-gray-900 pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold uppercase tracking-widest text-gray-900">{t('results.officialReport')}</h1>
                    <p className="text-sm text-gray-500 mt-2 font-medium tracking-wide">AI EXAM GRADER • REPORT ID: {result.id.slice(-8)}</p>
                </div>
                <div className="text-right rtl:text-left">
                    <h2 className="text-2xl font-bold text-gray-900">{result.studentName}</h2>
                    <p className="text-gray-600 font-medium">{result.studentGroup}</p>
                    <p className="text-sm text-gray-400 mt-1">{new Date(result.id).toLocaleDateString()}</p>
                </div>
            </div>

            {/* Print Score */}
            <div className="flex gap-6 mb-10">
                 <div className="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200">
                     <p className="text-xs font-bold uppercase text-gray-500 mb-2">{t('studentInfo.marksPlaceholder')}</p>
                     <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-gray-900">{result.score}</span>
                        <span className="text-2xl font-medium text-gray-400">/ {result.totalMarks}</span>
                     </div>
                 </div>
                 <div className={`flex-1 p-6 rounded-lg border flex flex-col justify-center items-center text-center ${result.cheatingAnalysis.detected ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <p className={`text-lg font-bold ${result.cheatingAnalysis.detected ? 'text-red-700' : 'text-green-700'}`}>
                        {result.cheatingAnalysis.detected ? t('results.cheatingDetected') : t('results.noCheatingDetected')}
                    </p>
                    {result.cheatingAnalysis.isAiGenerated && (
                        <p className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded mt-2">AI DETECTED</p>
                    )}
                 </div>
            </div>

            {/* Print Table */}
            <div>
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-gray-100 border-b-2 border-gray-900 text-gray-600">
                            <th className="py-3 px-4 text-left rtl:text-right font-bold w-12">#</th>
                            <th className="py-3 px-4 text-left rtl:text-right font-bold">{t('results.evaluation')}</th>
                            <th className="py-3 px-4 text-center font-bold w-24">{t('studentInfo.marksPlaceholder')}</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-800">
                        {result.detailedFeedback.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-200 break-inside-avoid">
                                <td className="py-4 px-4 align-top font-bold text-gray-400">{idx + 1}</td>
                                <td className="py-4 px-4 align-top">
                                    <div className="mb-3 font-bold text-base">{item.question}</div>
                                    <div className="mb-3 p-3 bg-gray-50 rounded border border-gray-100">
                                        <span className="block text-xs font-bold text-gray-400 uppercase mb-1">{t('results.studentAnswer')}:</span>
                                        {item.studentAnswer}
                                    </div>
                                    <div className="text-gray-600 italic pl-2 border-l-2 border-gray-300">
                                        {item.evaluation}
                                    </div>
                                </td>
                                <td className="py-4 px-4 align-top text-center font-bold text-lg">
                                    {item.marksAwarded} <span className="text-gray-400 text-sm font-normal">/ {item.maxMarks}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Print Footer */}
            <div className="mt-16 pt-8 border-t border-gray-300 flex justify-between items-end break-inside-avoid">
                <div className="text-xs text-gray-400">
                    <p>Powered by AI Exam Grader</p>
                    <p>Generated: {new Date().toLocaleString()}</p>
                </div>
                <div className="text-center">
                    <div className="w-64 border-b border-black mb-2 pb-8"></div>
                    <p className="font-bold text-xs uppercase tracking-wider">{t('results.graderSignature')}</p>
                    {graderName && <p className="text-lg font-serif mt-1">{graderName}</p>}
                </div>
            </div>
        </div>
    </div>
  );
};

export default ResultsDisplay;
