import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../contexts/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useThemeColors } from '../../hooks/useThemeColors';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email jest wymagany')
    .email('Nieprawidłowy format email'),
  password: z
    .string()
    .min(1, 'Hasło jest wymagane'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const colors = useThemeColors();

  const { control, handleSubmit } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setLoading(true);
    try {
      const result = await login(data.email, data.password);
      if (result.success) {
        router.replace('/');
      } else {
        setError(result.error || 'Nieprawidłowy email lub hasło');
      }
    } catch {
      setError('Błąd sieci. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await loginWithGoogle();
      if (result.success) {
        router.replace('/');
      } else {
        setError(result.error || 'Logowanie Google nie powiodło się');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }}>
      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 6,
        }}
      >
        <FontAwesome name="chevron-left" size={14} color={colors.tint} />
        <Text style={{ color: colors.tint, fontSize: 16 }}>Wróć</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 40 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: '700',
                color: colors.tint,
                marginBottom: 8,
              }}
            >
              WBTrade
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '600',
                color: colors.text,
                marginBottom: 4,
              }}
            >
              Witaj ponownie!
            </Text>
            <Text style={{ fontSize: 15, color: colors.textMuted }}>
              Zaloguj się do swojego konta
            </Text>
          </View>

          {/* Error banner */}
          {error && (
            <View
              style={{
                backgroundColor: colors.destructiveBg,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FontAwesome name="exclamation-circle" size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 14, flex: 1 }}>
                {error}
              </Text>
            </View>
          )}

          {/* Form */}
          <Input
            control={control}
            name="email"
            label="Email"
            placeholder="twoj@email.pl"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Input
            control={control}
            name="password"
            label="Hasło"
            placeholder="••••••••"
            secureTextEntry
            autoComplete="current-password"
          />

          {/* Forgot password */}
          <TouchableOpacity
            onPress={() => router.push('/(auth)/forgot-password')}
            style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: -8 }}
          >
            <Text style={{ color: colors.tint, fontSize: 14 }}>
              Zapomniałeś hasła?
            </Text>
          </TouchableOpacity>

          {/* Submit */}
          <Button
            title={loading ? 'Logowanie...' : 'Zaloguj się'}
            onPress={handleSubmit(onSubmit)}
            loading={loading}
            fullWidth
            size="lg"
          />

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Text style={{ marginHorizontal: 12, color: colors.textMuted, fontSize: 13 }}>lub</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          {/* Google login */}
          <TouchableOpacity
            onPress={handleGoogleLogin}
            disabled={googleLoading || loading}
            activeOpacity={0.75}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              borderWidth: 1.5,
              borderColor: colors.border,
              borderRadius: 12,
              paddingVertical: 14,
              backgroundColor: colors.card,
              opacity: googleLoading || loading ? 0.6 : 1,
            }}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <>
                <FontAwesome name="google" size={18} color="#4285F4" />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                  Kontynuuj przez Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Register link */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              Nie masz konta?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={{ color: colors.tint, fontSize: 14, fontWeight: '600' }}>
                Zarejestruj się
              </Text>
            </TouchableOpacity>
          </View>

          {/* Security note */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 32,
              gap: 6,
            }}
          >
            <FontAwesome name="lock" size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Połączenie szyfrowane SSL. Twoje dane są bezpieczne.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
