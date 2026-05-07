
import React, { useMemo, useRef } from 'react';
import type { GradingResult, BloomLevel } from '../types';
import { useAppContext } from '../context/AppContext';
import { XCircleIcon, CheckIcon, DownloadIcon } from './icons';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface GroupAnalyticsProps {
    results: GradingResult[];
    groupName: string;
}

const bloomLabels: Record<BloomLevel, { emoji: string }> = {
    knowledge: { emoji: '📝' },
    comprehension: { emoji: '💡' },
    application: { emoji: '🔧' },
    analysis: { emoji: '🔬' },
    synthesis: { emoji: '🧩' },
    evaluation: { emoji: '⚖️' },
};

const GroupAnalytics: React.FC<GroupAnalyticsProps> = ({ results, groupName }) => {
    const { t, language } = useAppContext();
    const analyticsRef = useRef<HTMLDivElement>(null);

    const stats = useMemo(() => {
        if (!results.length) return null;

        const scores = results.map(r => r.score);
        const totalMarks = results[0].totalMarks;
        
        const average = scores.reduce((a, b) => a + b, 0) / scores.length;
        const highest = Math.max(...scores);
        const lowest = Math.min(...scores);

        // Standard Deviation
        const variance = scores.reduce((sum, s) => sum + Math.pow(s - average, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);

        // Median
        const sorted = [...scores].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
            ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
            : sorted[Math.floor(sorted.length / 2)];

        // Pass Rate (>= 50%)
        const passCount = scores.filter(s => (s / totalMarks) * 100 >= 50).length;
        const passRate = (passCount / scores.length) * 100;

        // Grade Distribution buckets (0-25%, 25-50%, 50-75%, 75-100%)
        const distribution = [0, 0, 0, 0];
        scores.forEach(score => {
            const percentage = (score / totalMarks) * 100;
            if (percentage < 25) distribution[0]++;
            else if (percentage < 50) distribution[1]++;
            else if (percentage < 75) distribution[2]++;
            else distribution[3]++;
        });

        // Average Confidence Score
        const confidenceScores = results.map(r => r.confidenceScore ?? 75);
        const avgConfidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;

        // Item Analysis (per question)
        const questionCount = Math.max(...results.map(r => r.detailedFeedback?.length || 0));
        const itemAnalysis: { question: string; difficulty: number; avgScore: number; maxMarks: number; bloomLevel: BloomLevel }[] = [];
        
        for (let i = 0; i < questionCount; i++) {
            const questionsAtIndex = results
                .filter(r => r.detailedFeedback && r.detailedFeedback[i])
                .map(r => r.detailedFeedback[i]);
            
            if (questionsAtIndex.length === 0) continue;

            const avgScore = questionsAtIndex.reduce((s, q) => s + (q.marksAwarded || 0), 0) / questionsAtIndex.length;
            const maxMarks = questionsAtIndex[0].maxMarks || 1;
            const difficulty = (avgScore / maxMarks) * 100; // Higher = easier
            const bloomLevel = (questionsAtIndex[0].bloomLevel || 'knowledge') as BloomLevel;

            itemAnalysis.push({
                question: questionsAtIndex[0].question?.substring(0, 60) || `Q${i + 1}`,
                difficulty,
                avgScore,
                maxMarks,
                bloomLevel,
            });
        }

        // Bloom's Level Distribution
        const bloomDist: Record<string, number> = {};
        results.forEach(r => {
            (r.detailedFeedback || []).forEach(fb => {
                const level = fb.bloomLevel || 'knowledge';
                bloomDist[level] = (bloomDist[level] || 0) + 1;
            });
        });

        const getTopOccurrences = (items: string[]) => {
            const counts: {[key: string]: number} = {};
            items.forEach(item => {
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
            stdDev,
            median,
            passRate,
            passCount,
            distribution,
            totalMarks,
            avgConfidence,
            itemAnalysis,
            bloomDist,
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
                backgroundColor: '#ffffff',
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

                {/* Key Metrics - Extended */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-center border border-blue-100 dark:border-blue-800">
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">{t('archive.analytics.averageScore')}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.average.toFixed(1)}</p>
                        <p className="text-[10px] text-gray-500">/ {stats.totalMarks}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl text-center border border-green-100 dark:border-green-800">
                        <p className="text-[10px] text-green-600 dark:text-green-400 font-bold uppercase mb-1">{t('archive.analytics.highestScore')}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.highest}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl text-center border border-red-100 dark:border-red-800">
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-bold uppercase mb-1">{t('archive.analytics.lowestScore')}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.lowest}</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl text-center border border-purple-100 dark:border-purple-800">
                        <p className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase mb-1">{t('archive.analytics.stdDev')}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.stdDev.toFixed(2)}</p>
                    </div>
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl text-center border border-indigo-100 dark:border-indigo-800">
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase mb-1">{t('archive.analytics.median')}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.median.toFixed(1)}</p>
                    </div>
                    <div className={`p-4 rounded-xl text-center border ${stats.passRate >= 50 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800'}`}>
                        <p className={`text-[10px] font-bold uppercase mb-1 ${stats.passRate >= 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>{t('archive.analytics.passRate')}</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{stats.passRate.toFixed(0)}%</p>
                        <p className="text-[10px] text-gray-500">{stats.passCount}/{results.length}</p>
                    </div>
                </div>

                {/* Distribution Chart */}
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

                {/* Item Analysis Table */}
                {stats.itemAnalysis.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <h4 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            🔬 {t('archive.analytics.itemAnalysis')}
                        </h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b-2 border-gray-200 dark:border-gray-600 text-gray-500">
                                        <th className="py-2 px-3 text-left rtl:text-right font-bold">{t('results.question')}</th>
                                        <th className="py-2 px-3 text-center font-bold">{t('archive.analytics.bloomLevel')}</th>
                                        <th className="py-2 px-3 text-center font-bold">{t('archive.analytics.avgScore')}</th>
                                        <th className="py-2 px-3 text-center font-bold">{t('archive.analytics.difficultyIndex')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.itemAnalysis.map((item, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                                            <td className="py-2.5 px-3 text-gray-800 dark:text-gray-200 truncate max-w-[200px]" title={item.question}>
                                                <span className="font-bold text-gray-400 mr-1">Q{idx + 1}.</span> {item.question}
                                            </td>
                                            <td className="py-2.5 px-3 text-center">
                                                <span className="text-xs">{bloomLabels[item.bloomLevel]?.emoji} {t(`results.bloom.${item.bloomLevel}`)}</span>
                                            </td>
                                            <td className="py-2.5 px-3 text-center font-bold">
                                                {item.avgScore.toFixed(1)} <span className="text-gray-400 font-normal text-xs">/ {item.maxMarks}</span>
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <div className="flex items-center gap-2 justify-center">
                                                    <div className="w-20 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${item.difficulty >= 70 ? 'bg-green-500' : item.difficulty >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                            style={{ width: `${Math.min(100, item.difficulty)}%` }}
                                                        ></div>
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 w-10">{item.difficulty.toFixed(0)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-3 italic">{t('archive.analytics.difficultyNote')}</p>
                    </div>
                )}

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
