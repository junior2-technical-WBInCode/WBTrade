import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import { ModalProvider } from '@/components/ModalProvider';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  title: 'WBTrade Admin',
  description: 'Panel administracyjny WBTrade - zarzadzanie sklepem i magazynem',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" className="dark">
      <body className={`${inter.className} bg-admin-bg text-admin-text antialiased`}>
        <AuthProvider>
          <ModalProvider>
            <AdminLayout>{children}</AdminLayout>
          </ModalProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
