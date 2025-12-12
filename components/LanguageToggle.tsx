import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Language } from '../context/AppContext';
import { GlobeAltIcon, CheckIcon } from './icons';

const LanguageToggle: React.FC = () => {
  const { language, changeLanguage, t } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages: { code: Language; name: string }[] = [
    { code: 'ar', name: 'العربية' },
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
  ];

  const handleLanguageChange = (lang: Language) => {
    changeLanguage(lang);
    setIsOpen(false);
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors rounded-full"
        title={t('app.header.changeLanguage')}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <GlobeAltIcon className="w-6 h-6" />
      </button>

      {isOpen && (
        <div 
          className="absolute top-full mt-2 ltr:right-0 rtl:left-0 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-20 animate-fade-in"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="language-menu-button"
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 ltr:text-left rtl:text-right"
              role="menuitem"
            >
              <span>{lang.name}</span>
              {language === lang.code && <CheckIcon className="w-5 h-5 text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageToggle;
