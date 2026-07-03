import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import './index.css';
import { Layout } from './Layout';
import { StudioPage } from './pages/StudioPage';
import { LibraryPage } from './pages/LibraryPage';

// Register the GSAP React integration once, up front.
gsap.registerPlugin(useGSAP);
gsap.defaults({ ease: 'power2.out', duration: 0.5 });

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <StudioPage /> },
      { path: 'library', element: <LibraryPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
