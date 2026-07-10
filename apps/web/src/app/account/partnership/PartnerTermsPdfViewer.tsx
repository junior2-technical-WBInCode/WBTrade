'use client';

import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Served from apps/web/public/pdf.worker.min.mjs (copied from pdfjs-dist/build/pdf.worker.min.mjs
// — must be re-copied whenever the pdfjs-dist version bundled by react-pdf changes).
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PartnerTermsPdfViewerProps {
  fileUrl: string;
}

/**
 * Renders the real "Warunki Współpracy — Program Partnerski" PDF file inline
 * (not a re-typed approximation), inside whatever scrollable container the
 * parent provides. The parent tracks scroll position on that container to
 * gate the "I have read it" checkbox.
 */
export default function PartnerTermsPdfViewer({ fileUrl }: PartnerTermsPdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => setPageWidth(Math.max(240, el.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={() => setLoadError('Nie udało się wczytać dokumentu PDF.')}
        loading={<p className="text-sm text-gray-400 text-center py-10">Wczytywanie dokumentu...</p>}
        error={<p className="text-sm text-red-500 text-center py-10">Nie udało się wczytać dokumentu PDF.</p>}
      >
        {numPages != null &&
          Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              className="mb-3 shadow-sm border border-gray-100 dark:border-secondary-700 rounded-lg overflow-hidden"
            >
              <Page pageNumber={i + 1} width={pageWidth} renderAnnotationLayer={false} />
            </div>
          ))}
      </Document>
      {loadError && <p className="text-sm text-red-500 text-center py-6">{loadError}</p>}
    </div>
  );
}
