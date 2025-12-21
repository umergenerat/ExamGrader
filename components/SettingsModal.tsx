
import React, { useState, useEffect } from 'react';
import type { AppSettings, GradingStrictness, PlagiarismSensitivity } from '../App';
import { InfoIcon } from './icons';
import { useAppContext } from '../context/AppContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
  currentSettings: AppSettings;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentSettings }) => {
  const [settings, setSettings] = useState(currentSettings);
  const [showHelp, setShowHelp] = useState(false);
  const { t } = useAppContext();

  // State for group management
  const [groups, setGroups] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    if (isOpen) {
        setSettings(currentSettings);
        const groupList = currentSettings.studentGroups.split('\n').map(g => g.trim()).filter(Boolean);
        setGroups(groupList);
        // Reset local state on open
        setNewGroup('');
        setEditingIndex(null);
        setEditingValue('');
    }
  }, [currentSettings, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const trimmedValue = editingValue.trim();
    if (trimmedValue && !groups.some((g, i) => g === trimmedValue && i !== editingIndex)) {
      const updatedGroups = [...groups];
      updatedGroups[editingIndex] = trimmedValue;
      setGroups(updatedGroups);
    }
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleSave = () => {
    if (editingIndex !== null) {
        handleSaveEdit();
    }

    const updatedSettings = {
      ...settings,
      studentGroups: groups.join('\n')
    };
    onSave(updatedSettings);
  };

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Group management handlers
  const handleAddGroup = () => {
    const trimmedGroup = newGroup.trim();
    if (trimmedGroup && !groups.includes(trimmedGroup)) {
      setGroups([...groups, trimmedGroup]);
      setNewGroup('');
    }
  };

  const handleDeleteGroup = (indexToDelete: number) => {
    const groupName = groups[indexToDelete];
    if (window.confirm(t('settings.studentGroups.deleteConfirm', { groupName }))) {
      setGroups(groups.filter((_, index) => index !== indexToDelete));
    }
  };

  const handleStartEdit = (index: number, value: string) => {
    setEditingIndex(index);
    setEditingValue(value);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingValue('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl flex flex-col animate-fade-in-up max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h2>
        </div>

        <div className="flex-grow overflow-hidden flex flex-col md:flex-row">
          <div className="flex-shrink-0 w-full md:w-64 bg-gray-50 dark:bg-gray-900/50 p-4 sm:p-6 border-b md:border-b-0 md:border-l rtl:md:border-l-0 rtl:md:border-r border-gray-200 dark:border-gray-700 overflow-x-auto">
            <h3 className="font-bold mb-3 md:mb-4 hidden md:block text-gray-900 dark:text-white">{t('settings.navigation')}</h3>
            <nav>
                <ul className="flex md:block space-x-4 md:space-x-0 md:space-y-2 whitespace-nowrap md:whitespace-normal">
                    <li><button onClick={() => scrollToSection('api-key-section')} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-white md:bg-transparent px-3 py-1.5 md:p-0 rounded-full md:rounded-none shadow-sm md:shadow-none w-auto md:w-full ltr:text-left rtl:text-right transition">{t('settings.apiKey.label')}</button></li>
                    <li><button onClick={() => scrollToSection('student-groups-section')} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-white md:bg-transparent px-3 py-1.5 md:p-0 rounded-full md:rounded-none shadow-sm md:shadow-none w-auto md:w-full ltr:text-left rtl:text-right transition">{t('settings.studentGroups.label')}</button></li>
                    <li><button onClick={() => scrollToSection('advanced-settings-section')} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-white md:bg-transparent px-3 py-1.5 md:p-0 rounded-full md:rounded-none shadow-sm md:shadow-none w-auto md:w-full ltr:text-left rtl:text-right transition">{t('settings.advanced.title')}</button></li>
                </ul>
            </nav>
          </div>

          <div className="flex-grow overflow-y-auto p-4 sm:p-6">
            <div id="api-key-section" className="scroll-mt-6 space-y-4">
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('settings.apiKey.label')}
                  </label>
                  <input id="apiKey" type="password" value={settings.apiKey} onChange={(e) => setSettings(s => ({...s, apiKey: e.target.value}))} placeholder={t('settings.apiKey.placeholder')} className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" />
                  <p className="text-xs text-gray-500 mt-2">
                    {t('settings.apiKey.note')}
                  </p>
                </div>
                
                <div>
                  <label htmlFor="graderName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('settings.graderName.label')}
                  </label>
                  <input id="graderName" type="text" value={settings.graderName} onChange={(e) => setSettings(s => ({...s, graderName: e.target.value}))} placeholder={t('settings.graderName.placeholder')} className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition" />
                  <p className="text-xs text-gray-500 mt-2">
                    {t('settings.graderName.note')}
                  </p>
                </div>
            </div>
            
            <hr className="my-6 border-gray-200 dark:border-gray-600" />
            
            <div id="student-groups-section" className="scroll-mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('settings.studentGroups.manageTitle')}
              </label>
              <div className="space-y-2 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600">
                  {groups.length > 0 ? (
                      groups.map((group, index) => (
                          <div key={`${group}-${index}`} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded-md shadow-sm animate-fade-in">
                              {editingIndex === index ? (
                                  <>
                                      <input
                                          type="text"
                                          value={editingValue}
                                          onChange={(e) => setEditingValue(e.target.value)}
                                          className="flex-grow px-2 py-1 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none transition text-sm"
                                          autoFocus
                                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
                                      />
                                      <div className="flex gap-1 ltr:ml-2 rtl:mr-2 flex-shrink-0">
                                          <button onClick={handleSaveEdit} className="text-xs font-bold text-green-600 hover:underline">{t('settings.studentGroups.saveButton')}</button>
                                          <button onClick={handleCancelEdit} className="text-xs text-gray-500 hover:underline">{t('settings.studentGroups.cancelButton')}</button>
                                      </div>
                                  </>
                              ) : (
                                  <>
                                      <span className="text-sm truncate" title={group}>{group}</span>
                                      <div className="flex gap-2 ltr:ml-2 rtl:mr-2 flex-shrink-0">
                                          <button onClick={() => handleStartEdit(index, group)} className="text-xs font-semibold text-blue-600 hover:underline">{t('settings.studentGroups.editButton')}</button>
                                          <button onClick={() => handleDeleteGroup(index)} className="text-xs font-semibold text-red-600 hover:underline">{t('settings.studentGroups.deleteButton')}</button>
                                      </div>
                                  </>
                              )}
                          </div>
                      ))
                  ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('settings.studentGroups.empty')}</p>
                  )}
              </div>
              <div className="flex gap-2 mt-3">
                  <input
                      type="text"
                      value={newGroup}
                      onChange={(e) => setNewGroup(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); }}
                      placeholder={t('settings.studentGroups.addGroupPlaceholder')}
                      className="flex-grow w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  />
                  <button onClick={handleAddGroup} className="px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition text-sm flex-shrink-0 disabled:bg-gray-400" disabled={!newGroup.trim()}>
                      {t('settings.studentGroups.addButton')}
                  </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                  {t('settings.studentGroups.note')}
              </p>
            </div>
            
            <hr className="my-6 border-gray-200 dark:border-gray-600" />

            <div id="advanced-settings-section" className="scroll-mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{t('settings.advanced.title')}</h3>
                <button onClick={() => setShowHelp(prev => !prev)} className="text-gray-400 hover:text-blue-500 transition-colors" title={t('settings.advanced.helpTitle')} aria-label={t('settings.advanced.helpTitle')} aria-expanded={showHelp}>
                    <InfoIcon className="w-5 h-5" />
                </button>
              </div>

              {showHelp && (
                <div className="p-3 mb-4 bg-gray-100 dark:bg-gray-700 rounded-md text-sm text-gray-600 dark:text-gray-300 space-y-2 animate-fade-in">
                  <p><strong>{t('settings.strictness.label')}:</strong> {t('settings.advanced.help.strictness')}</p>
                  <p><strong>{t('settings.sensitivity.label')}:</strong> {t('settings.advanced.help.sensitivity')}</p>
                  <p><strong>{t('settings.customInstructions.label')}:</strong> {t('settings.advanced.help.instructions')}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="gradingStrictness" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('settings.strictness.label')}
                  </label>
                  <select
                    id="gradingStrictness"
                    value={settings.gradingStrictness}
                    onChange={(e) => setSettings(s => ({...s, gradingStrictness: e.target.value as GradingStrictness}))}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  >
                    <option value="Scientific">{t('settings.strictness.scientific')}</option>
                    <option value="Lenient">{t('settings.strictness.lenient')}</option>
                    <option value="Normal">{t('settings.strictness.normal')}</option>
                    <option value="Strict">{t('settings.strictness.strict')}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="plagiarismSensitivity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('settings.sensitivity.label')}
                  </label>
                  <select
                    id="plagiarismSensitivity"
                    value={settings.plagiarismSensitivity}
                    onChange={(e) => setSettings(s => ({...s, plagiarismSensitivity: e.target.value as PlagiarismSensitivity}))}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  >
                    <option value="Low">{t('settings.sensitivity.low')}</option>
                    <option value="Medium">{t('settings.sensitivity.medium')}</option>
                    <option value="High">{t('settings.sensitivity.high')}</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="customInstructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('settings.customInstructions.label')}
                  </label>
                  <textarea
                    id="customInstructions"
                    rows={3}
                    value={settings.customInstructions}
                    onChange={(e) => setSettings(s => ({...s, customInstructions: e.target.value}))}
                    placeholder={t('settings.customInstructions.placeholder')}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                  />
                   <p className="text-xs text-gray-500 mt-2">
                    {t('settings.customInstructions.note')}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="p-4 sm:p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 sm:px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 sm:px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition shadow-lg shadow-blue-500/20"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

