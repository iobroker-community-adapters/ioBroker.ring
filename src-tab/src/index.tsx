import { createRoot } from 'react-dom/client';

import App from './App';

declare global {
    interface Window {
        adapterName: string | undefined;
    }
}

window.adapterName = 'ring';

const container = document.getElementById('root');
if (container) {
    createRoot(container).render(<App />);
}
