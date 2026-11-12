'use client';

import React, { useEffect, useState } from 'react';
import { getVocabularyStatus, setVocabularyStatus, type VocabularyStatus } from '@/services/kedo/vocabulary';

import Popup from '@/components/Popup';
import { Position } from '@/utils/sel';
import {
  useDictionaryResults,
  DictionaryResultsHeader,
  DictionaryResultsBody,
} from './DictionaryResultsView';
import type { DictionarySelectionContext } from '@/services/dictionaries/types';

interface DictionaryPopupProps {
  word: string;
  lang?: string;
  selection?: DictionarySelectionContext;
  position: Position;
  trianglePosition: Position;
  popupWidth: number;
  popupHeight: number;
  onDismiss?: () => void;
  /**
   * Invoked when the user clicks the header gear. The host (Annotator)
   * decides how to navigate — typically by opening the SettingsDialog and
   * deep-linking to the dictionaries sub-page.
   */
  onManage?: () => void;
}

const DictionaryPopup: React.FC<DictionaryPopupProps> = ({
  word,
  lang,
  selection,
  position,
  trianglePosition,
  popupWidth,
  popupHeight,
  onDismiss,
  onManage,
}) => {
  const state = useDictionaryResults({ word, lang, selection });
  const [wordStatus, setWordStatus] = useState<VocabularyStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  useEffect(() => {
    try { setWordStatus(getVocabularyStatus(state.currentWord)); setStatusError(false); }
    catch { setWordStatus(null); setStatusError(true); }
  }, [state.currentWord]);
  const saveStatus = (status: VocabularyStatus) => {
    try { setVocabularyStatus(state.currentWord, status); setWordStatus(status); setStatusError(false); }
    catch { setStatusError(true); }
  };
  return (
    <Popup
      width={popupWidth}
      height={popupHeight}
      position={position}
      trianglePosition={trianglePosition}
      className='select-text'
      onDismiss={onDismiss}
    >
      {/* `overflow-hidden rounded-lg` clips the body's section backgrounds /
          borders to the Popup's rounded shape. */}
      <div className='flex h-full flex-col overflow-hidden rounded-lg pt-4'>
        <DictionaryResultsHeader
          headerClassName='-mt-2'
          currentWord={state.currentWord}
          canGoBack={state.canGoBack}
          goBack={state.goBack}
          onManage={onManage}
          onSpeak={state.speakWord}
          speaking={state.isSpeaking}
        />
        <div className='flex gap-2 px-3 py-1' aria-label='词汇状态'>
          <button className='btn btn-xs' aria-pressed={wordStatus === 'learning'} onClick={() => saveStatus('learning')}>学习中</button>
          <button className='btn btn-xs' aria-pressed={wordStatus === 'mastered'} onClick={() => saveStatus('mastered')}>已掌握</button>
          {statusError && <span role='status'>词汇状态保存失败</span>}
        </div>
        <div className='min-h-0 flex-1'>
          <DictionaryResultsBody {...state} />
        </div>
      </div>
    </Popup>
  );
};

export default DictionaryPopup;
