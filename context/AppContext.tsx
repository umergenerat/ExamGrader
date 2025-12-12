import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { translations } from '../i18n/locales';

export type Language = 'en' | 'ar' | 'fr';
export type Theme = 'light' | 'dark';

interface AppContextType {
  language: Language;
  changeLanguage: (lang: Language) => void;
  t: (key: string, options?: { [key: string]: string | number }) => string;
  theme: Theme;
  toggleTheme: () => void;
  translations: typeof translations;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('ar');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Initialize Language
    const storedLang = localStorage.getItem('language') as Language | null;
    const browserLang = navigator.language.split('-')[0];
    const initialLang = storedLang || (browserLang === 'ar' ? 'ar' : (browserLang === 'fr' ? 'fr' : 'ar')); // Default to Arabic
    setLanguage(initialLang);

    // Initialize Theme
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(storedTheme || (prefersDark ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('language', language);
  }, [language]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'dark' ? 'light' : 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);

    // Update the browser's theme color to match the app's header
    const themeColor = theme === 'dark' ? '#1f2937' : '#ffffff';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  }, [theme]);
  
  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
  };

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
      const keys = key.split('.');
      // FIX: Type `result` as `any` to prevent incorrect type inference (`never`) during deep object traversal.
      let result: any = translations[language];
      for (const k of keys) {
        if (result && typeof result === 'object' && k in result) {
            result = result[k];
        } else {
            return key; // Return key if not found
        }
      }

      if (typeof result !== 'string') return key;

      if (options) {
        return result.replace(/\{\{(\w+)\}\}/g, (_, placeholder) => {
          return String(options[placeholder] || placeholder);
        });
      }

      return result;
  }, [language]);

  const value = useMemo(() => ({
    language,
    changeLanguage,
    t,
    theme,
    toggleTheme,
    translations,
  }), [language, t, theme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};