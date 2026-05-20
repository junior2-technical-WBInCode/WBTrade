'use client';

import React, { useState, useEffect } from 'react';
import { AddressData } from '../page';

interface AddressFormProps {
  initialData: AddressData;
  onSubmit: (data: AddressData) => void;
  isGuestCheckout?: boolean;
}

interface SavedAddress {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

// Lista krajów z numerami kierunkowymi
const countries = [
  { code: 'PL', name: 'Polska', dialCode: '+48', flag: '🇵🇱' },
  { code: 'DE', name: 'Niemcy', dialCode: '+49', flag: '🇩🇪' },
  { code: 'CZ', name: 'Czechy', dialCode: '+420', flag: '🇨🇿' },
  { code: 'SK', name: 'Słowacja', dialCode: '+421', flag: '🇸🇰' },
  { code: 'UA', name: 'Ukraina', dialCode: '+380', flag: '🇺🇦' },
  { code: 'LT', name: 'Litwa', dialCode: '+370', flag: '🇱🇹' },
  { code: 'GB', name: 'Wielka Brytania', dialCode: '+44', flag: '🇬🇧' },
  { code: 'FR', name: 'Francja', dialCode: '+33', flag: '🇫🇷' },
  { code: 'NL', name: 'Holandia', dialCode: '+31', flag: '🇳🇱' },
  { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgia', dialCode: '+32', flag: '🇧🇪' },
  { code: 'IT', name: 'Włochy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Hiszpania', dialCode: '+34', flag: '🇪🇸' },
  { code: 'SE', name: 'Szwecja', dialCode: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norwegia', dialCode: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Dania', dialCode: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finlandia', dialCode: '+358', flag: '🇫🇮' },
  { code: 'CH', name: 'Szwajcaria', dialCode: '+41', flag: '🇨🇭' },
];

// Input Component
function InputField({
  id,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  label,
  error,
  required,
  maxLength,
  placeholder,
}: {
  id: string;
  name: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  label: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`
          w-full h-11 px-4
          bg-white dark:bg-secondary-700 border rounded-lg
          text-gray-900 dark:text-white text-sm
          outline-none transition-colors
          focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
          placeholder:text-gray-400 dark:placeholder:text-gray-500
          ${error 
            ? 'border-red-400' 
            : 'border-gray-300 dark:border-secondary-600'
          }
        `}
      />
      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

export default function AddressForm({ initialData, onSubmit, isGuestCheckout = false }: AddressFormProps) {
  const [formData, setFormData] = useState<AddressData>(initialData);
  const [errors, setErrors] = useState<Partial<Record<keyof AddressData, string>>>({});
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(initialData.phone.replace(/^\+\d+\s*/, ''));
  
  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedSavedAddress, setSelectedSavedAddress] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  
  // User company data from profile
  const [userCompanyData, setUserCompanyData] = useState<{
    companyName?: string;
    nip?: string;
    companyStreet?: string;
    companyCity?: string;
    companyPostalCode?: string;
  } | null>(null);

  // Check if user is logged in and fetch saved addresses (skip for guest checkout)
  useEffect(() => {
    if (isGuestCheckout) {
      setIsLoggedIn(false);
      return;
    }
    
    const checkAuthAndFetchAddresses = async () => {
      const storedTokens = localStorage.getItem('auth_tokens');
      let token = null;
      if (storedTokens) {
        try {
          const parsed = JSON.parse(storedTokens);
          token = parsed.accessToken;
        } catch {
          // Invalid token format
        }
      }
      
      if (token) {
        setIsLoggedIn(true);
        setLoadingAddresses(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        try {
          // Fetch addresses
          const response = await fetch(`${apiUrl}/addresses`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          let addresses: SavedAddress[] = [];
          if (response.ok) {
            addresses = await response.json();
            setSavedAddresses(addresses);
            
            // Auto-select default address if form is empty
            const defaultAddress = addresses.find((addr) => addr.isDefault);
            if (defaultAddress && !initialData.firstName && !initialData.street) {
              setSelectedSavedAddress(defaultAddress.id);
              const country = countries.find(c => c.code === defaultAddress.country) || countries[0];
              setSelectedCountry(country);
              const phone = defaultAddress.phone || '';
              setPhoneNumber(phone.replace(/^\+\d+\s*/, ''));
              
              setFormData(prev => ({
                ...prev,
                firstName: defaultAddress.firstName,
                lastName: defaultAddress.lastName,
                street: defaultAddress.street,
                city: defaultAddress.city,
                postalCode: defaultAddress.postalCode,
                phone: phone,
              }));
            }
          }
          
          // Fetch user profile for company data
          const profileResponse = await fetch(`${apiUrl}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.user) {
              setUserCompanyData({
                companyName: profileData.user.companyName,
                nip: profileData.user.nip,
                companyStreet: profileData.user.companyStreet,
                companyCity: profileData.user.companyCity,
                companyPostalCode: profileData.user.companyPostalCode,
              });

              // Auto-fill billing data for B2B partners
              if (profileData.user.b2bStatus === 'APPROVED') {
                setFormData(prev => ({
                  ...prev,
                  differentBillingAddress: true,
                  billingFirstName: profileData.user.firstName || prev.firstName || '',
                  billingLastName: profileData.user.lastName || prev.lastName || '',
                  billingCompanyName: profileData.user.companyName || '',
                  billingNip: profileData.user.nip || '',
                  billingStreet: profileData.user.companyStreet || prev.billingStreet || '',
                  billingCity: profileData.user.companyCity || prev.billingCity || '',
                  billingPostalCode: profileData.user.companyPostalCode || prev.billingPostalCode || '',
                  billingPhone: profileData.user.phone || prev.phone || '',
                }));
              }
            }
          }
        } catch (error) {
          console.error('Error fetching addresses:', error);
        } finally {
          setLoadingAddresses(false);
        }
      }
    };
    
    checkAuthAndFetchAddresses();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name as keyof AddressData]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d\s]/g, '');
    setPhoneNumber(value);
    setFormData(prev => ({
      ...prev,
      phone: `${selectedCountry.dialCode} ${value}`.trim(),
    }));
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  const handleCountrySelect = (country: typeof countries[0]) => {
    setSelectedCountry(country);
    setFormData(prev => ({
      ...prev,
      phone: `${country.dialCode} ${phoneNumber}`.trim(),
    }));
    setIsCountryDropdownOpen(false);
  };

  const handleSelectSavedAddress = (address: SavedAddress) => {
    setSelectedSavedAddress(address.id);
    setSaveAddress(false); // Reset save checkbox when selecting existing address
    const country = countries.find(c => c.code === address.country) || countries[0];
    setSelectedCountry(country);
    const phone = address.phone || '';
    setPhoneNumber(phone.replace(/^\+\d+\s*/, ''));
    
    setFormData(prev => ({
      ...prev,
      firstName: address.firstName,
      lastName: address.lastName,
      street: address.street,
      city: address.city,
      postalCode: address.postalCode,
      phone: phone,
    }));
  };

  const handleEnterNewAddress = () => {
    setSelectedSavedAddress(null);
    // Reset form to initial empty state
    setFormData({
      ...initialData,
      firstName: '',
      lastName: '',
      street: '',
      apartment: '',
      city: '',
      postalCode: '',
      phone: '',
    });
    setPhoneNumber('');
  };

  // Walidacja pojedynczego pola
  const validateField = (name: string, value: string): string => {
    switch (name) {
      case 'firstName':
        if (!value.trim()) return 'Imię jest wymagane';
        if (value.trim().length < 2) return 'Imię musi mieć min. 2 znaki';
        if (value.trim().length > 50) return 'Imię może mieć max. 50 znaków';
        if (!/^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]+$/.test(value)) return 'Imię może zawierać tylko litery';
        return '';
      
      case 'lastName':
        if (!value.trim()) return 'Nazwisko jest wymagane';
        if (value.trim().length < 2) return 'Nazwisko musi mieć min. 2 znaki';
        if (value.trim().length > 50) return 'Nazwisko może mieć max. 50 znaków';
        if (!/^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]+$/.test(value)) return 'Nazwisko może zawierać tylko litery';
        return '';
      
      case 'email':
        if (!value.trim()) return 'Email jest wymagany';
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
        if (!emailRegex.test(value) || value.length > 254) return 'Podaj prawidłowy adres email';
        return '';
      
      case 'street':
        if (!value.trim()) return 'Ulica i numer są wymagane';
        if (value.trim().length < 3) return 'Podaj pełny adres';
        if (value.trim().length > 100) return 'Adres może mieć max. 100 znaków';
        return '';
      
      case 'city':
        if (!value.trim()) return 'Miasto jest wymagane';
        if (value.trim().length < 2) return 'Nazwa miasta musi mieć min. 2 znaki';
        if (!/^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]+$/.test(value)) return 'Nazwa miasta może zawierać tylko litery';
        return '';
      
      case 'postalCode':
        if (!value.trim()) return 'Kod pocztowy jest wymagany';
        if (!/^\d{2}-\d{3}$/.test(value)) return 'Format: XX-XXX';
        return '';
      
      case 'billingStreet':
        if (!value.trim()) return 'Ulica do faktury jest wymagana';
        if (value.trim().length < 3) return 'Podaj pełny adres';
        return '';
      
      case 'billingCity':
        if (!value.trim()) return 'Miasto jest wymagane';
        if (!/^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]+$/.test(value)) return 'Nazwa miasta może zawierać tylko litery';
        return '';
      
      case 'billingPostalCode':
        if (!value.trim()) return 'Kod pocztowy jest wymagany';
        if (!/^\d{2}-\d{3}$/.test(value)) return 'Format: XX-XXX';
        return '';
      
      default:
        return '';
    }
  };

  // Walidacja telefonu
  const validatePhone = (): string => {
    if (!phoneNumber.trim()) return 'Telefon jest wymagany';
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (digitsOnly.length < 9) return 'Numer musi mieć min. 9 cyfr';
    if (digitsOnly.length > 12) return 'Numer może mieć max. 12 cyfr';
    return '';
  };

  // Obsługa blur - walidacja przy opuszczeniu pola
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const error = validateField(name, value);
    if (error) {
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handlePhoneBlur = () => {
    const error = validatePhone();
    if (error) {
      setErrors(prev => ({ ...prev, phone: error }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof AddressData, string>> = {};

    // Walidacja wszystkich pól
    const firstNameError = validateField('firstName', formData.firstName);
    if (firstNameError) newErrors.firstName = firstNameError;

    const lastNameError = validateField('lastName', formData.lastName);
    if (lastNameError) newErrors.lastName = lastNameError;

    const emailError = validateField('email', formData.email);
    if (emailError) newErrors.email = emailError;

    const phoneError = validatePhone();
    if (phoneError) newErrors.phone = phoneError;

    const streetError = validateField('street', formData.street);
    if (streetError) newErrors.street = streetError;

    const postalCodeError = validateField('postalCode', formData.postalCode);
    if (postalCodeError) newErrors.postalCode = postalCodeError;

    const cityError = validateField('city', formData.city);
    if (cityError) newErrors.city = cityError;

    if (formData.differentBillingAddress) {
      const billingStreetError = validateField('billingStreet', formData.billingStreet || '');
      if (billingStreetError) newErrors.billingStreet = billingStreetError;

      const billingPostalCodeError = validateField('billingPostalCode', formData.billingPostalCode || '');
      if (billingPostalCodeError) newErrors.billingPostalCode = billingPostalCodeError;

      const billingCityError = validateField('billingCity', formData.billingCity || '');
      if (billingCityError) newErrors.billingCity = billingCityError;
    }

    setErrors(newErrors);
    
    // Scroll do pierwszego błędu
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      const element = document.getElementById(firstErrorField);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus();
      }
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      // Save address if checkbox is checked and not using an existing saved address
      if (saveAddress && isLoggedIn && !selectedSavedAddress) {
        const storedTokens = localStorage.getItem('auth_tokens');
        if (storedTokens) {
          try {
            const parsed = JSON.parse(storedTokens);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
            await fetch(`${apiUrl}/addresses`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${parsed.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                firstName: formData.firstName.trim(),
                lastName: formData.lastName.trim(),
                street: formData.street.trim(),
                city: formData.city.trim(),
                postalCode: formData.postalCode.trim(),
                country: selectedCountry.code,
                phone: formData.phone?.trim(),
                isDefault: savedAddresses.length === 0,
                label: 'Adres dostawy',
                type: 'SHIPPING',
              }),
            });
          } catch (error) {
            console.error('Error saving address:', error);
          }
        }
      }
      onSubmit(formData);
    }
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'postalCode' | 'billingPostalCode') => {
    let value = e.target.value.replace(/[^\d]/g, '');
    if (value.length > 2) {
      value = value.slice(0, 2) + '-' + value.slice(2, 5);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="bg-white dark:bg-secondary-800 rounded-lg shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b dark:border-secondary-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Adres dostawy</h2>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Saved Addresses */}
        {isLoggedIn && savedAddresses.length > 0 && (
          <div className="px-6 py-4 border-b dark:border-secondary-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Zapisane adresy</h3>
            <div className="space-y-2">
              {savedAddresses.map((address) => (
                <label
                  key={address.id}
                  className={`
                    flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-colors
                    ${selectedSavedAddress === address.id
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-secondary-600 hover:bg-gray-50 dark:hover:bg-secondary-700'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                        ${selectedSavedAddress === address.id ? 'border-orange-500' : 'border-gray-300 dark:border-secondary-500'}
                      `}
                    >
                      {selectedSavedAddress === address.id && (
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                      )}
                    </div>
                    <input
                      type="radio"
                      name="savedAddress"
                      checked={selectedSavedAddress === address.id}
                      onChange={() => handleSelectSavedAddress(address)}
                      className="sr-only"
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{address.firstName} {address.lastName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{address.street}, {address.postalCode} {address.city}</p>
                    </div>
                  </div>
                  {address.isDefault && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                      Domyślny
                    </span>
                  )}
                </label>
              ))}
            </div>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-secondary-600"></div>
              </div>
              <div className="relative flex justify-center">
                <button
                  type="button"
                  onClick={handleEnterNewAddress}
                  className="px-3 bg-white dark:bg-secondary-800 text-xs text-orange-500 hover:text-orange-600 cursor-pointer"
                >
                  lub wprowadź nowy adres
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Personal Info */}
        <div className="px-6 py-4 border-b dark:border-secondary-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Dane osobowe</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              onBlur={handleBlur}
              label="Imię"
              error={errors.firstName}
              required
              placeholder="np. Jan"
            />
            <InputField
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              onBlur={handleBlur}
              label="Nazwisko"
              error={errors.lastName}
              required
              placeholder="np. Kowalski"
            />
          </div>
        </div>

        {/* Contact */}
        <div className="px-6 py-4 border-b dark:border-secondary-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Kontakt</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              label="Email"
              error={errors.email}
              required
              placeholder="jan@example.com"
            />
            
            {/* Phone with country selector */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Telefon<span className="text-red-500 ml-0.5">*</span>
              </label>
              <div className="relative flex">
                <button
                  type="button"
                  onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                  className={`
                    flex items-center gap-1 px-3 h-11 
                    bg-gray-50 dark:bg-secondary-700 hover:bg-gray-100 dark:hover:bg-secondary-600 border rounded-l-lg
                    border-r-0 transition-colors
                    ${errors.phone ? 'border-red-400' : 'border-gray-300 dark:border-secondary-600'}
                  `}
                >
                  <span className="text-base">{selectedCountry.flag}</span>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{selectedCountry.dialCode}</span>
                  <svg className={`w-3 h-3 text-gray-400 transition-transform ${isCountryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {isCountryDropdownOpen && (
                  <div className="absolute z-50 top-full mt-1 left-0 w-64 bg-white dark:bg-secondary-700 border border-gray-200 dark:border-secondary-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {countries.map((country) => (
                      <button
                        key={country.code}
                        type="button"
                        onClick={() => handleCountrySelect(country)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-secondary-600 transition-colors ${
                          selectedCountry.code === country.code ? 'bg-orange-50 dark:bg-orange-900/30' : ''
                        }`}
                      >
                        <span className="text-lg">{country.flag}</span>
                        <span className="flex-1 text-left text-sm text-gray-700 dark:text-gray-200">{country.name}</span>
                        <span className="text-sm text-gray-400">{country.dialCode}</span>
                      </button>
                    ))}
                  </div>
                )}
                
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  onBlur={handlePhoneBlur}
                  placeholder="123 456 789"
                  className={`
                    flex-1 h-11 px-4
                    bg-white dark:bg-secondary-700 border rounded-r-lg
                    text-gray-900 dark:text-white text-sm
                    outline-none transition-colors
                    focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
                    placeholder:text-gray-400 dark:placeholder:text-gray-500
                    ${errors.phone 
                      ? 'border-red-400' 
                      : 'border-gray-300 dark:border-secondary-600'
                    }
                  `}
                />
              </div>
              {errors.phone && (
                <p className="mt-1 text-sm text-red-500">{errors.phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="px-6 py-4 border-b dark:border-secondary-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Adres</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <InputField
                  id="street"
                  name="street"
                  value={formData.street}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  label="Ulica i numer"
                  error={errors.street}
                  required
                  placeholder="ul. Przykładowa 123"
                />
              </div>
              <InputField
                id="apartment"
                name="apartment"
                value={formData.apartment}
                onChange={handleChange}
                label="Mieszkanie"
                placeholder="np. m. 5"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Kod pocztowy<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  id="postalCode"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={(e) => handlePostalCodeChange(e, 'postalCode')}
                  onBlur={handleBlur}
                  maxLength={6}
                  placeholder="00-000"
                  className={`
                    w-full h-11 px-4
                    bg-white dark:bg-secondary-700 border rounded-lg
                    text-gray-900 dark:text-white text-sm
                    outline-none transition-colors
                    focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
                    placeholder:text-gray-400 dark:placeholder:text-gray-500
                    ${errors.postalCode 
                      ? 'border-red-400' 
                      : 'border-gray-300 dark:border-secondary-600'
                    }
                  `}
                />
                {errors.postalCode && (
                  <p className="mt-1 text-sm text-red-500">{errors.postalCode}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <InputField
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  label="Miasto"
                  error={errors.city}
                  required
                  placeholder="np. Warszawa"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="px-6 py-4 border-b dark:border-secondary-700 space-y-3">
          {isLoggedIn && !selectedSavedAddress && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAddress}
                onChange={(e) => setSaveAddress(e.target.checked)}
                className="w-4 h-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded dark:bg-secondary-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Zapamiętaj ten adres na przyszłość</span>
            </label>
          )}

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="differentBillingAddress"
              name="differentBillingAddress"
              checked={formData.differentBillingAddress}
              onChange={handleChange}
              className="w-4 h-4 text-orange-500 focus:ring-orange-500 border-gray-300 dark:border-secondary-600 rounded dark:bg-secondary-700"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Dane firmy i adres do faktury</span>
          </label>
        </div>

        {/* Billing Address */}
        {formData.differentBillingAddress && (
          <div className="px-6 py-4 border-b dark:border-secondary-700 bg-gray-50 dark:bg-secondary-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Dane do faktury</h3>
              {isLoggedIn && userCompanyData && (userCompanyData.companyName || userCompanyData.nip) && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      billingCompanyName: userCompanyData.companyName || '',
                      billingNip: userCompanyData.nip || '',
                      billingStreet: userCompanyData.companyStreet || '',
                      billingCity: userCompanyData.companyCity || '',
                      billingPostalCode: userCompanyData.companyPostalCode || '',
                    }));
                  }}
                  className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-500 dark:hover:text-orange-400 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Uzupełnij z profilu
                </button>
              )}
            </div>
            <div className="space-y-4">
              {/* Company Name and NIP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="billingCompanyName"
                  name="billingCompanyName"
                  value={formData.billingCompanyName || ''}
                  onChange={handleChange}
                  label="Nazwa firmy"
                  placeholder="np. Firma Sp. z o.o."
                />
                <InputField
                  id="billingNip"
                  name="billingNip"
                  value={formData.billingNip || ''}
                  onChange={handleChange}
                  label="NIP"
                  placeholder="np. 1234567890"
                  maxLength={13}
                />
              </div>

              {/* Street and Apartment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <InputField
                    id="billingStreet"
                    name="billingStreet"
                    value={formData.billingStreet || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    label="Ulica i numer"
                    error={errors.billingStreet}
                    required
                    placeholder="ul. Przykładowa 123"
                  />
                </div>
                <InputField
                  id="billingApartment"
                  name="billingApartment"
                  value={formData.billingApartment || ''}
                  onChange={handleChange}
                  label="Lokal"
                  placeholder="np. lok. 5"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="billingPostalCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Kod pocztowy<span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    id="billingPostalCode"
                    name="billingPostalCode"
                    value={formData.billingPostalCode || ''}
                    onChange={(e) => handlePostalCodeChange(e, 'billingPostalCode')}
                    onBlur={handleBlur}
                    maxLength={6}
                    placeholder="00-000"
                    className={`
                      w-full h-11 px-4
                      bg-white dark:bg-secondary-600 border rounded-lg
                      text-gray-900 dark:text-white text-sm
                      outline-none transition-colors
                      focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500
                      placeholder:text-gray-400 dark:placeholder:text-gray-500
                      ${errors.billingPostalCode 
                        ? 'border-red-400' 
                        : 'border-gray-300 dark:border-secondary-500'
                      }
                    `}
                  />
                  {errors.billingPostalCode && (
                    <p className="mt-1 text-sm text-red-500">{errors.billingPostalCode}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <InputField
                    id="billingCity"
                    name="billingCity"
                    value={formData.billingCity || ''}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    label="Miasto"
                    error={errors.billingCity}
                    required
                    placeholder="np. Warszawa"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Login hint */}
        {!isLoggedIn && (
          <div className="px-6 py-4 border-b dark:border-secondary-700 bg-gray-50 dark:bg-secondary-700">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>
                <a href="/login?redirect=/checkout" className="text-orange-600 font-medium hover:underline">Zaloguj się</a>
                {' '}aby zapisać adres i szybciej składać zamówienia.
              </span>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-end px-6 py-4">
          <button
            type="submit"
            className="px-6 py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
          >
            Dalej →
          </button>
        </div>
      </form>
    </div>
  );
}
