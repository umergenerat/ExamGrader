
import React from 'react';
import Spinner from './Spinner';
import { useAppContext } from '../context/AppContext';

const Loader = ({ messageKey }: { messageKey: string }) => {
    const { t } = useAppContext();
    return (
        <div className="flex flex-col items-center justify-center text-center p-8">
            <Spinner />
            <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">{t(messageKey)}</p>
        </div>
    );
};

export default Loader;