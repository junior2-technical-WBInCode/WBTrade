import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { ThemeColors } from '../../constants/Colors';
import Button from '../ui/Button';
import { api } from '../../services/api';

interface PaymentOption {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  extraFee: number;
}

const FALLBACK_PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'payu',
    name: 'PayU',
    description: 'BLIK, karta płatnicza, szybki przelew, Google Pay',
    icon: 'shield-checkmark-outline',
    extraFee: 0,
  },
];

interface PaymentMethodProps {
  onSubmit: (data: { method: string; methodName: string; extraFee: number }) => void;
  onBack: () => void;
}

export default function PaymentMethod({ onSubmit, onBack }: PaymentMethodProps) {
  const [selected, setSelected] = useState<string>('payu');
  const [paymentOptions, setPaymentOptions] = useState<PaymentOption[]>(FALLBACK_PAYMENT_OPTIONS);
  const [loading, setLoading] = useState(true);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const loadPaymentMethods = async () => {
      try {
        const response = await api.get<{ paymentMethods: any[] }>('/checkout/payment/methods');
        if (response.paymentMethods && response.paymentMethods.length > 0) {
          const mapped: PaymentOption[] = response.paymentMethods.map((m: any) => ({
            id: m.id || m.type,
            name: m.name,
            description: m.description || 'Płatność online',
            icon: 'shield-checkmark-outline' as keyof typeof Ionicons.glyphMap,
            extraFee: m.fee || 0,
          }));
          setPaymentOptions(mapped);
          if (mapped.length > 0 && !mapped.find(o => o.id === selected)) {
            setSelected(mapped[0].id);
          }
        }
      } catch (err) {
        console.warn('Could not fetch payment methods, using fallback:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPaymentMethods();
  }, []);

  const handleSubmit = () => {
    const option = paymentOptions.find(o => o.id === selected);
    if (option) {
      onSubmit({
        method: option.id,
        methodName: option.name,
        extraFee: option.extraFee,
      });
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>Krok 3: Metoda płatności</Text>
        <Text style={styles.stepDesc}>Wybierz sposób płatności za zamówienie</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={styles.loadingText}>Ładowanie metod płatności...</Text>
        </View>
      ) : null}

      <View style={styles.optionsSection}>
        {paymentOptions.map(option => {
          const isSelected = selected === option.id;

          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => setSelected(option.id)}
            >
              <View style={styles.optionLeft}>
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </View>
              <View style={styles.optionContent}>
                <View style={styles.optionHeader}>
                  <View style={styles.payuBadge}>
                    <Text style={styles.payuBadgeText}>PayU</Text>
                  </View>
                  <Text style={[styles.optionName, isSelected && styles.optionNameSelected]}>
                    {option.name}
                  </Text>
                </View>
                <Text style={styles.optionDesc}>{option.description}</Text>
                {option.extraFee > 0 && (
                  <Text style={styles.optionFee}>
                    Dodatkowa opłata: {option.extraFee.toFixed(2).replace('.', ',')} zł
                  </Text>
                )}
                {isSelected && (
                  <View style={styles.paymentIcons}>
                    <View style={[styles.methodBadge, { backgroundColor: '#E51151' }]}>
                      <Text style={styles.methodBadgeText}>BLIK</Text>
                    </View>
                    <View style={[styles.methodBadge, { backgroundColor: '#1A1F71' }]}>
                      <Text style={styles.methodBadgeText}>VISA</Text>
                    </View>
                    <View style={[styles.methodBadge, { backgroundColor: '#EB001B' }]}>
                      <Text style={styles.methodBadgeText}>MC</Text>
                    </View>
                    <View style={[styles.methodBadge, { backgroundColor: '#4285F4' }]}>
                      <Text style={styles.methodBadgeText}>GPay</Text>
                    </View>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
        <Text style={styles.infoText}>
          Płatność jest bezpieczna i szyfrowana. Po kliknięciu "Dalej" przejdziesz do podsumowania
          zamówienia.
        </Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← Wstecz</Text>
        </TouchableOpacity>
        <View style={styles.nextButton}>
          <Button
            title="Dalej — podsumowanie"
            onPress={handleSubmit}
            disabled={!selected}
            size="lg"
          />
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 40 },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: colors.textMuted,
  },
  stepHeader: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  stepDesc: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  optionsSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  optionCardSelected: {
    borderColor: colors.tint,
    backgroundColor: colors.tintLight,
  },
  optionLeft: { marginRight: 12, marginTop: 2 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: colors.tint },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.tint,
  },
  optionContent: { flex: 1 },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  optionNameSelected: {
    color: colors.tint,
  },
  optionDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  optionFee: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.successBg,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: colors.successText,
    lineHeight: 17,
  },
  payuBadge: {
    backgroundColor: '#A6C307',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  payuBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  paymentIcons: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  methodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  methodBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 12,
  },
  backButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  backText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  nextButton: { flex: 1 },
});
