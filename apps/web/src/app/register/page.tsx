'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { trackSignup } from '@/lib/analytics';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated } = useAuth();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    acceptTerms: false,
    acceptPrivacy: false,
    acceptNewsletter: false,
    acceptB2bTerms: false,
    // B2B fields
    accountType: 'personal' as 'personal' | 'business',
    companyName: '',
    nip: '',
    companyStreet: '',
    companyCity: '',
    companyPostalCode: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'fair' | 'good' | 'strong' | null>(null);

  // Redirect if already logged in
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push('/account');
    }
  }, [isAuthenticated, router]);

  const checkPasswordStrength = (password: string) => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

    if (score < 3) return 'weak';
    if (score < 4) return 'fair';
    if (score < 5) return 'good';
    return 'strong';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
    
    if (name === 'password') {
      setPasswordStrength(value ? checkPasswordStrength(value) : null);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      acceptTerms: checked,
      acceptPrivacy: checked,
      acceptNewsletter: checked,
    }));
  };

  const allChecked = formData.acceptTerms && formData.acceptPrivacy && formData.acceptNewsletter;

  // Walidacja email - RFC 5322 compliant
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emailRegex.test(email) && email.length <= 254;
  };

  const validateForm = (): string | null => {
    if (!formData.firstName.trim()) return 'Imię jest wymagane';
    if (formData.firstName.trim().length < 2) return 'Imię musi mieć minimum 2 znaki';
    if (!formData.lastName.trim()) return 'Nazwisko jest wymagane';
    if (formData.lastName.trim().length < 2) return 'Nazwisko musi mieć minimum 2 znaki';
    if (!formData.email.trim()) return 'Email jest wymagany';
    if (!isValidEmail(formData.email)) return 'Podaj prawidłowy adres email (np. jan@przykład.pl)';
    if (formData.password.length < 8) return 'Hasło musi mieć minimum 8 znaków';
    if (!/[A-Z]/.test(formData.password)) return 'Hasło musi zawierać wielką literę';
    if (!/[a-z]/.test(formData.password)) return 'Hasło musi zawierać małą literę';
    if (!/[0-9]/.test(formData.password)) return 'Hasło musi zawierać cyfrę';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password)) return 'Hasło musi zawierać znak specjalny';
    if (formData.password !== formData.confirmPassword) return 'Hasła nie są identyczne';
    // B2B validation
    if (formData.accountType === 'business') {
      if (!formData.companyName.trim()) return 'Nazwa firmy jest wymagana';
      if (!formData.nip.trim()) return 'NIP jest wymagany';
      if (!/^\d{10}$/.test(formData.nip.replace(/[\s-]/g, ''))) return 'NIP musi składać się z 10 cyfr';
      if (!formData.companyStreet.trim()) return 'Adres firmy jest wymagany';
      if (!formData.companyCity.trim()) return 'Miasto jest wymagane';
      if (!/^\d{2}-\d{3}$/.test(formData.companyPostalCode)) return 'Nieprawidłowy kod pocztowy (format: XX-XXX)';
      if (!formData.phone.trim()) return 'Telefon jest wymagany dla konta firmowego';
      if (!formData.acceptB2bTerms) return 'Musisz zaakceptować zasady współpracy B2B';
    }
    if (!formData.acceptTerms) return 'Musisz zaakceptować regulamin';
    if (!formData.acceptPrivacy) return 'Musisz zaakceptować politykę prywatności';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);

    const result = await register({
      email: formData.email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName,
      newsletter: formData.acceptNewsletter,
      // B2B fields
      ...(formData.accountType === 'business' && {
        accountType: 'business',
        companyName: formData.companyName,
        nip: formData.nip.replace(/[\s-]/g, ''),
        companyStreet: formData.companyStreet,
        companyCity: formData.companyCity,
        companyPostalCode: formData.companyPostalCode,
        phone: formData.phone,
      }),
    });

    if (result.success) {
      trackSignup('email');
      if (formData.accountType === 'business') {
        router.push('/account?registered=true&b2b=pending');
      } else {
        router.push('/account?registered=true');
      }
    } else {
      setError(result.error || 'Rejestracja nie powiodła się');
    }

    setIsLoading(false);
  };

  const strengthConfig = {
    weak: { color: 'bg-red-500', textColor: 'text-red-600', width: '25%', label: 'Słabe' },
    fair: { color: 'bg-yellow-500', textColor: 'text-yellow-600', width: '50%', label: 'Średnie' },
    good: { color: 'bg-blue-500', textColor: 'text-blue-600', width: '75%', label: 'Dobre' },
    strong: { color: 'bg-green-500', textColor: 'text-green-600', width: '100%', label: 'Silne' },
  };

  const passwordRequirements = [
    { regex: /.{8,}/, label: 'Min. 8 znaków' },
    { regex: /[a-z]/, label: 'Mała litera' },
    { regex: /[A-Z]/, label: 'Wielka litera' },
    { regex: /[0-9]/, label: 'Cyfra' },
    { regex: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, label: 'Znak specjalny' },
  ];

  return (
    <div className="min-h-screen flex bg-white dark:bg-secondary-900">
      {/* Left side - Hero */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-orange-500 via-orange-600 to-red-500 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative flex flex-col justify-center px-12 xl:px-20 text-white">
          {/* Illustration */}
          <div className="mb-12">
            <div className="w-32 h-32 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mb-8">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
          </div>

          <h2 className="text-4xl xl:text-5xl font-bold mb-6 leading-tight">
            Dołącz do<br />
            WB Trade już dziś!
          </h2>

          <p className="text-xl text-white/80 mb-12 max-w-md">
            Załóż konto i ciesz się wyjątkowymi korzyściami dla zarejestrowanych użytkowników.
          </p>

          {/* Benefits */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Niskie ceny</p>
                <p className="text-sm text-white/70">Miej kontrolę nad swoimi zamówieniami</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Historia zamówień</p>
                <p className="text-sm text-white/70">Śledź wszystkie swoje zakupy</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Lista ulubionych</p>
                <p className="text-sm text-white/70">Zapisuj produkty na później</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>
                <p className="font-semibold">Powiadomienia o promocjach</p>
                <p className="text-sm text-white/70">Bądź pierwszy przy okazjach</p>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-16 xl:px-20 bg-white dark:bg-secondary-900 overflow-y-auto py-8">
        <div className="mx-auto w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-2 group">
              <Image
                src="/images/WB-TRADE-logo.webp"
                alt="WBTrade"
                width={120}
                height={40}
                className="h-10 w-auto dark:hidden"
              />
              <Image
                src="/images/wb-trade-bez-tla.webp"
                alt="WBTrade"
                width={120}
                height={40}
                className="h-10 w-auto hidden dark:block"
              />
            </Link>
            <Link 
              href="/" 
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Wróć do sklepu
            </Link>
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Utwórz konto 
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Zarejestruj się i zacznij oszczędzać
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Name fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Imię
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    placeholder="Jan"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Nazwisko
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    placeholder="Kowalski"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Adres email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="block w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  placeholder="twoj@email.pl"
                />
              </div>
            </div>

            {/* Account Type Switcher */}
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Typ konta
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-secondary-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, accountType: 'personal' }))}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    formData.accountType === 'personal'
                      ? 'bg-white dark:bg-secondary-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}
                >
                  🏠 Konto prywatne
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, accountType: 'business' }))}
                  className={`py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    formData.accountType === 'business'
                      ? 'bg-white dark:bg-secondary-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}
                >
                  🏢 Konto firmowe B2B
                </button>
              </div>
            </div>

            {/* B2B Company Fields */}
            {formData.accountType === 'business' && (
              <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-3">
                  📋 Dane firmy — wymagane do weryfikacji współpracy B2B
                </p>
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nazwa firmy
                  </label>
                  <input
                    id="companyName"
                    name="companyName"
                    type="text"
                    value={formData.companyName}
                    onChange={handleChange}
                    className="block w-full px-3 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white dark:bg-secondary-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                    placeholder="Nazwa Twojej firmy"
                  />
                </div>
                <div>
                  <label htmlFor="nip" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    NIP
                  </label>
                  <input
                    id="nip"
                    name="nip"
                    type="text"
                    value={formData.nip}
                    onChange={handleChange}
                    className="block w-full px-3 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white dark:bg-secondary-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                    placeholder="1234567890"
                    maxLength={13}
                  />
                </div>
                <div>
                  <label htmlFor="companyStreet" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Adres firmy
                  </label>
                  <input
                    id="companyStreet"
                    name="companyStreet"
                    type="text"
                    value={formData.companyStreet}
                    onChange={handleChange}
                    className="block w-full px-3 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white dark:bg-secondary-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                    placeholder="ul. Przykładowa 1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="companyCity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Miasto
                    </label>
                    <input
                      id="companyCity"
                      name="companyCity"
                      type="text"
                      value={formData.companyCity}
                      onChange={handleChange}
                      className="block w-full px-3 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white dark:bg-secondary-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                      placeholder="Warszawa"
                    />
                  </div>
                  <div>
                    <label htmlFor="companyPostalCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Kod pocztowy
                    </label>
                    <input
                      id="companyPostalCode"
                      name="companyPostalCode"
                      type="text"
                      value={formData.companyPostalCode}
                      onChange={handleChange}
                      className="block w-full px-3 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white dark:bg-secondary-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                      placeholder="00-000"
                      maxLength={6}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Telefon kontaktowy
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="block w-full px-3 py-2.5 border border-gray-200 dark:border-secondary-600 rounded-lg text-gray-900 dark:text-white dark:bg-secondary-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                    placeholder="+48 123 456 789"
                  />
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  ℹ️ Po rejestracji Twoje konto firmowe będzie wymagało weryfikacji przez nasz zespół. Do momentu akceptacji konto działa jako zwykłe konto klienta.
                </p>
              </div>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Hasło
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full pl-11 pr-11 py-3 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Password strength indicator */}
              {formData.password && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${passwordStrength ? strengthConfig[passwordStrength].color : ''} transition-all duration-300`}
                        style={{ width: passwordStrength ? strengthConfig[passwordStrength].width : '0%' }}
                      />
                    </div>
                    {passwordStrength && (
                      <span className={`text-xs font-medium ${strengthConfig[passwordStrength].textColor}`}>
                        {strengthConfig[passwordStrength].label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {passwordRequirements.map((req, idx) => (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          req.regex.test(formData.password)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {req.regex.test(formData.password) && '✓ '}
                        {req.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                Potwierdź hasło
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`block w-full pl-11 pr-11 py-3 border rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                    formData.confirmPassword && formData.password !== formData.confirmPassword
                      ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500'
                      : formData.confirmPassword && formData.password === formData.confirmPassword
                      ? 'border-green-300 focus:ring-green-500/20 focus:border-green-500'
                      : 'border-gray-200 focus:ring-orange-500/20 focus:border-orange-500'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirmPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Hasła nie są identyczne
                </p>
              )}
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Hasła są identyczne
                </p>
              )}
            </div>

            {/* Zgody — 4 checkboxy */}
            <div className="space-y-1 pt-2">
              {/* Zaznacz wszystko */}
              <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
                <input
                  id="selectAll"
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 focus:ring-offset-0"
                />
                <label htmlFor="selectAll" className="text-sm font-semibold text-gray-800 dark:text-gray-200 select-none cursor-pointer">
                  Zaznacz wszystko
                </label>
              </div>

              {/* Regulamin — wymagany */}
              <div className="flex items-start gap-3 py-1.5 px-2">
                <input
                  id="acceptTerms"
                  name="acceptTerms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={handleChange}
                  className="mt-0.5 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 focus:ring-offset-0"
                />
                <label htmlFor="acceptTerms" className="text-sm text-gray-600 dark:text-gray-300 leading-snug select-none cursor-pointer">
                  Akceptuję{' '}
                  <Link href="/terms" className="text-orange-500 hover:text-orange-600 font-medium">
                    regulamin
                  </Link>
                  {' '}<span className="text-red-500">*</span>
                </label>
              </div>

              {/* Polityka prywatności — wymagana */}
              <div className="flex items-start gap-3 py-1.5 px-2">
                <input
                  id="acceptPrivacy"
                  name="acceptPrivacy"
                  type="checkbox"
                  checked={formData.acceptPrivacy}
                  onChange={handleChange}
                  className="mt-0.5 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 focus:ring-offset-0"
                />
                <label htmlFor="acceptPrivacy" className="text-sm text-gray-600 dark:text-gray-300 leading-snug select-none cursor-pointer">
                  Akceptuję{' '}
                  <Link href="/privacy" className="text-orange-500 hover:text-orange-600 font-medium">
                    politykę prywatności
                  </Link>
                  {' '}<span className="text-red-500">*</span>
                </label>
              </div>

              {/* B2B terms — wymagany dla konta firmowego */}
              {formData.accountType === 'business' && (
                <div className="flex items-start gap-3 py-1.5 px-2 bg-gradient-to-r from-orange-50/50 to-white dark:from-orange-900/10 dark:to-secondary-800 rounded-xl border border-orange-200 dark:border-orange-800/30">
                  <input
                    id="acceptB2bTerms"
                    name="acceptB2bTerms"
                    type="checkbox"
                    checked={formData.acceptB2bTerms}
                    onChange={handleChange}
                    className="mt-0.5 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 focus:ring-offset-0"
                  />
                  <label htmlFor="acceptB2bTerms" className="text-sm text-gray-600 dark:text-gray-300 leading-snug select-none cursor-pointer">
                    Oświadczam, że zakładam Konto firmowe (B2B) jako przedsiębiorca i akceptuję{' '}
                    <Link href="/cooperation" className="text-orange-500 hover:text-orange-600 font-medium">
                      zasady współpracy B2B
                    </Link>
                    {' '}oraz{' '}
                    <Link href="/terms" className="text-orange-500 hover:text-orange-600 font-medium">
                      Regulamin Sklepu
                    </Link>
                    {' '}<span className="text-red-500">*</span>
                  </label>
                </div>
              )}

              {/* Newsletter — opcjonalny */}
              <div className="flex items-start gap-3 py-1.5 px-2 bg-gradient-to-r from-white to-orange-50/50 dark:from-secondary-800 dark:to-orange-900/10 rounded-xl">
                <input
                  id="acceptNewsletter"
                  name="acceptNewsletter"
                  type="checkbox"
                  checked={formData.acceptNewsletter}
                  onChange={handleChange}
                  className="mt-0.5 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 focus:ring-offset-0"
                />
                <label htmlFor="acceptNewsletter" className="text-sm text-gray-600 dark:text-gray-300 leading-snug select-none cursor-pointer">
                  Chcę otrzymywać newsletter z promocjami i nowościami
                  <span className="block text-xs text-orange-500 mt-1 font-medium">
                    🎁 Zapisz się i otrzymaj kod rabatowy -10%!
                  </span>
                </label>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 mt-6"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Tworzenie konta...
                </>
              ) : (
                <>
                  Utwórz konto
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-secondary-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white dark:bg-secondary-900 text-gray-500 dark:text-gray-400">lub</span>
            </div>
          </div>

          {/* Google Register Button */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/api/auth/google`}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 border-2 border-gray-200 dark:border-secondary-600 bg-white dark:bg-secondary-800 text-gray-700 dark:text-gray-200 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-secondary-700 hover:border-gray-300 dark:hover:border-secondary-500 focus:outline-none focus:ring-2 focus:ring-gray-500/20 transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Zarejestruj przez Google
          </a>

          {/* Login link */}
          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Masz już konto?{' '}
            <Link href="/login" className="font-semibold text-orange-500 hover:text-orange-600 transition-colors">
              Zaloguj się
            </Link>
          </p>

          {/* Security note */}
          <p className="mt-6 text-center text-xs text-gray-400 dark:text-gray-500">
            🔒 Połączenie szyfrowane SSL. Twoje dane są bezpieczne.
          </p>
        </div>
      </div>
    </div>
  );
}
