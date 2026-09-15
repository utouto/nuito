import {StrictMode} from 'react';import{createRoot}from'react-dom/client';import'leaflet/dist/leaflet.css';import'./styles.css';import App from'./App';import{initialize}from'./db';
initialize().then(()=>createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>));
