'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useState } from 'react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Served from apps/web/public/pdf.worker.min.mjs (copied from pdfjs-dist/build/pdf.worker.min.mjs
// — must be re-copied whenever the pdfjs-dist version bundled by react-pdf changes).
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PartnerTermsPdfViewerProps {
  fileUrl: string;
  /** Page render width in CSS pixels, computed by the parent from a stable
   *  (non-content-sized) container. Passing it in avoids a self-referential
   *  resize loop that previously made pages render too small and, on
   *  window/zoom changes, overlap with a stale render of the previous size. */
  containerWidth: number;
}

/**
 * Renders the real "Warunki Współpracy — Program Partnerski" PDF file inline
 * (not a re-typed approximation), inside whatever scrollable container the
 * parent provides. The parent tracks scroll position on that container to
 * gate the "I have read it" checkbox.
 */
export default function PartnerTermsPdfViewer({ fileUrl, containerWidth }: PartnerTermsPdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageWidth = Math.max(280, Math.round(containerWidth));

  return (
    <div>
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
              {/* Text/annotation layers disabled: this is a read-only compliance viewer, and
                  re-enabling them caused duplicated/overlapping text whenever the page re-rendered
                  at a new width (window resize / browser zoom). */}
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
      </Document>
      {loadError && <p className="text-sm text-red-500 text-center py-6">{loadError}</p>}
    </div>
  );
}
