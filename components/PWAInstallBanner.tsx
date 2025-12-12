
import React from 'react';
import { DownloadIcon, XCircleIcon, InstallDesktopIcon } from './icons';
import { useAppContext } from '../context/AppContext';

interface PWAInstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ onInstall, onDismiss }) => {
  const { t } = useAppContext();
  return (
    <div 
        className="fixed bottom-0 left-0 right-0 md:left-auto md:right-6 md:bottom-6 md:w-[28rem] z-50 p-4 md:p-0 animate-fade-in-up"
        role="dialog"
        aria-labelledby="pwa-install-title"
        aria-describedby="pwa-install-description"
    >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col sm:flex-row items-start gap-4 backdrop-blur-sm bg-opacity-95 dark:bg-opacity-95">
            <div className="flex-shrink-0 bg-blue-100 dark:bg-blue-900/30 p-3 rounded-xl">
                <InstallDesktopIcon className="w-8 h-8 text-blue-600 dark:text-blue-400"/>
            </div>
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <h3 id="pwa-install-title" className="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1">{t('pwa.title')}</h3>
                    <button
                        onClick={onDismiss}
                        aria-label={t('pwa.dismissButton')}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors -mt-1 -mr-1 p-1"
                    >
                        <XCircleIcon className="w-6 h-6" />
                    </button>
                </div>
                <p id="pwa-install-description" className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                    {t('pwa.description')}
                </p>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onInstall}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg text-sm flex items-center justify-center gap-2"
                    >
                        <DownloadIcon className="w-4 h-4" />
                        {t('pwa.installButton')}
                    </button>
                    <button
                        onClick={onDismiss}
                        className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm"
                    >
                        {t('common.cancel')}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default PWAInstallBanner;
