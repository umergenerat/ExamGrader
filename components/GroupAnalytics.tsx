
import React, { useMemo, useRef } from 'react';
import type { GradingResult } from '../types';
import { useAppContext } from '../context/AppContext';
import { XCircleIcon, CheckIcon, DownloadIcon } from './icons';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface GroupAnalyticsProps {
    results: GradingResult[];
    groupName: string;
}

const GroupAnalytics: React.FC<GroupAnalyticsProps> = ({ results, groupName }) => {
    const { t, language } = useAppContext();
    const analyticsRef = useRef<HTMLDivElement>(null);

    const stats = useMemo(() => {
        if (!results.length) return null;

        const scores = results.map(r => r.score);
        const totalMarks = results[0].totalMarks; // Assuming all have same total marks
        
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highest = Math.max(...scores);
        const lowest = Math.min(...scores);

        // Grade Distribution buckets (0-25%, 25-50%, 50-75%, 75-100%)
        const distribution = [0, 0, 0, 0];
        scores.forEach(score => {
            const percentage = (score / totalMarks) * 100;
            if (percentage < 25) distribution[0]++;
            else if (percentage < 50) distribution[1]++;
            else if (percentage < 75) distribution[2]++;
            else distribution[3]++;
        });

        const getTopOccurrences = (items: string[]) => {
            const counts: {[key: string]: number} = {};
            items.forEach(item => {
                // Simple normalization
                const norm = item.trim(); 
                counts[norm] = (counts[norm] || 0) + 1;
            });
            return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
        };

        const allWeaknesses = results.flatMap(r => r.weaknesses);
        const allStrengths = results.flatMap(r => r.strengths);

        return {
            average,
            highest,
            lowest,
            distribution,
            totalMarks,
            topWeaknesses: getTopOccurrences(allWeaknesses),
            topStrengths: getTopOccurrences(allStrengths),
        };
    }, [results]);

    const handleExportPdf = async () => {
        if (!analyticsRef.current) return;

        try {
            const originalDir = document.documentElement.dir;
            document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

            const canvas = await html2canvas(analyticsRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff', // Force white background
            });

            document.documentElement.dir = originalDir;

            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                format: [canvas.width, canvas.height],
                hotfixes: ['px_scaling'],
            });

            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
            pdf.save(`analytics-${groupName}.pdf`);
        } catch (err) {
            console.error('Failed to export analytics PDF:', err);
            alert(t('results.exportError'));
        }
    };

    if (!stats) return <div className="p-6 text-center text-gray-500">{t('archive.analytics.noData')}</div>;

    const maxDistVal = Math.max(...stats.distribution);

    return (
        <div className="space-y-6">
            <div className="flex justify-end px-6 pt-4">
                <button 
                    onClick={handleExportPdf}
                    className="flex items-center gap-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg"
                >
                    <DownloadIcon className="w-4 h-4" />
                    PDF
                </button>
            </div>
            
            <div ref={analyticsRef} className="space-y-8 animate-fade-in p-6 bg-white dark:bg-gray-800">
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('archive.analytics.title', { groupName })}</h2>
                    <p className="text-gray-500">{t('archive.analytics.students', { count: results.length })}</p>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-center border border-blue-100 dark:border-blue-800">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">{t('archive.analytics.averageScore')}</p>
                        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.average.toFixed(1)} <span className="text-sm font-normal text-gray-500">/ {stats.totalMarks}</span></p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl text-center border border-green-100 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 font-bold uppercase mb-1">{t('archive.analytics.highestScore')}</p>
                        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.highest}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl text-center border border-red-100 dark:border-red-800">
                        <p className="text-xs text-red-600 dark:text-red-400 font-bold uppercase mb-1">{t('archive.analytics.lowestScore')}</p>
                        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.lowest}</p>
                    </div>
                </div>

                {/* Distribution Chart (CSS Only for simplicity & performance) */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-6">{t('archive.analytics.gradeDistribution')}</h4>
                    <div className="flex items-end justify-between h-40 gap-2 sm:gap-4 px-2">
                        {['0-25%', '25-50%', '50-75%', '75-100%'].map((label, idx) => {
                            const count = stats.distribution[idx];
                            const height = maxDistVal > 0 ? (count / maxDistVal) * 100 : 0;
                            const color = idx === 0 ? 'bg-red-400' : idx === 1 ? 'bg-orange-400' : idx === 2 ? 'bg-yellow-400' : 'bg-green-500';
                            return (
                                <div key={label} className="flex flex-col items-center flex-1 group">
                                    <div className="relative w-full flex items-end justify-center h-full bg-gray-100 dark:bg-gray-700/50 rounded-t-lg overflow-hidden">
                                        <div 
                                            className={`w-full ${color} opacity-80 group-hover:opacity-100 transition-all duration-500 ease-out`} 
                                            style={{ height: `${height}%` }}
                                        ></div>
                                        <span className="absolute bottom-2 font-bold text-gray-700 dark:text-white">{count}</span>
                                    </div>
                                    <span className="text-[10px] sm:text-xs font-medium text-gray-500 mt-2">{label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Weaknesses */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h4 className="font-bold text-red-600 dark:text-red-400 mb-4 flex items-center gap-2">
                            <XCircleIcon className="w-5 h-5" />
                            {t('archive.analytics.commonWeaknesses')}
                        </h4>
                        <ul className="space-y-3">
                            {stats.topWeaknesses.map(([text, count], i) => (
                                <li key={i} className="flex justify-between items-start gap-3 text-sm p-2 rounded-lg bg-red-50 dark:bg-red-900/10">
                                    <span className="text-gray-700 dark:text-gray-300">{text}</span>
                                    <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">{count}x</span>
                                </li>
                            ))}
                            {stats.topWeaknesses.length === 0 && <p className="text-gray-400 italic text-sm">No significant data.</p>}
                        </ul>
                    </div>

                    {/* Strengths */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h4 className="font-bold text-green-600 dark:text-green-400 mb-4 flex items-center gap-2">
                            <CheckIcon className="w-5 h-5" />
                            {t('archive.analytics.commonStrengths')}
                        </h4>
                        <ul className="space-y-3">
                            {stats.topStrengths.map(([text, count], i) => (
                                <li key={i} className="flex justify-between items-start gap-3 text-sm p-2 rounded-lg bg-green-50 dark:bg-green-900/10">
                                    <span className="text-gray-700 dark:text-gray-300">{text}</span>
                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">{count}x</span>
                                </li>
                            ))}
                            {stats.topStrengths.length === 0 && <p className="text-gray-400 italic text-sm">No significant data.</p>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupAnalytics;
