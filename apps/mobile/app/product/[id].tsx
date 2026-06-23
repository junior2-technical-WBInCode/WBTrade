import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { pluralizeReviews } from '../../utils/pluralize';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ViewToken,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { ThemeColors } from '../../constants/Colors';
import { useCart } from '../../contexts/CartContext';
import { useWishlist } from '../../contexts/WishlistContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import ProductCarousel from '../../components/product/ProductCarousel';
import AddToListModal from '../../components/AddToListModal';
import BottomTabBar from '../../components/ui/BottomTabBar';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Product, ProductVariant } from '../../services/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CITY_LOCATIVE_MAP: Record<string, string> = {
  'Zielona Góra': 'Zielonej Górze',
  'Warszawa': 'Warszawie',
  'Ryki': 'Rykach',
  'Chynów': 'Chynowie',
  'Chotów': 'Chotowie',
  'Koszalin': 'Koszalinie',
  'Białystok': 'Białymstoku',
  'Rzeszów': 'Rzeszowie',
};

// Decode HTML entities
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&oacute;/g, 'ó')
    .replace(/&eacute;/g, 'é')
    .replace(/&#\d+;/g, (m) => {
      const code = parseInt(m.replace(/&#|;/g, ''));
      return String.fromCharCode(code);
    })
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Parse HTML into structured blocks for rendering — simple universal approach
type HtmlBlock = { type: 'heading' | 'paragraph' | 'list' | 'table'; text?: string; items?: string[]; rows?: Array<[string, string]> };

function parseHtmlBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  let cleaned = html.replace(/\r\n/g, '\n').replace(/\t/g, ' ');

  // 1) Extract <table> blocks
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  cleaned = cleaned.replace(tableRegex, (_, tableContent) => {
    const rows: Array<[string, string]> = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tableContent)) !== null) {
      const cells: string[] = [];
      let tdMatch;
      tdRegex.lastIndex = 0;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        cells.push(decodeEntities(tdMatch[1].replace(/<[^>]*>/g, '').trim()));
      }
      if (cells.length >= 2) rows.push([cells[0], cells[1]]);
    }
    if (rows.length > 0) blocks.push({ type: 'table', rows });
    return '';
  });

  // 2) Extract <ul>/<ol> lists — keep as plain bullet lists
  const ulRegex = /<[uo]l[^>]*>([\s\S]*?)<\/[uo]l>/gi;
  cleaned = cleaned.replace(ulRegex, (_, listContent) => {
    const items: string[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(listContent)) !== null) {
      let text = decodeEntities(liMatch[1].replace(/<[^>]*>/g, '').trim());
      text = text.replace(/^[\-–•·]\s*/, '');
      if (text) items.push(text);
    }
    if (items.length > 0) blocks.push({ type: 'list', items });
    return '';
  });

  // 3) Extract <h1>-<h6> headings
  cleaned = cleaned.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, content) => {
    const text = decodeEntities(content.replace(/<[^>]*>/g, '').trim());
    if (text) blocks.push({ type: 'heading', text });
    return '';
  });

  // 4) Strip all remaining HTML tags, preserve line breaks from <br> and </p>
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ');

  // 5) Decode entities, split into paragraphs by double-newline
  const paragraphs = decodeEntities(cleaned)
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0);

  for (const p of paragraphs) {
    blocks.push({ type: 'paragraph', text: p });
  }

  return blocks;
}

// Render parsed HTML blocks as React Native components
function HtmlContent({ html }: { html: string }) {
  const blocks = parseHtmlBlocks(html);
  const colors = useThemeColors();
  const htmlStyles = useMemo(() => createHtmlStyles(colors), [colors]);

  return (
    <View>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <Text key={i} style={[htmlStyles.heading, i === 0 && { marginTop: 0 }]}>
                {block.text}
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i} style={htmlStyles.paragraph}>
                {block.text}
              </Text>
            );
          case 'list':
            return (
              <View key={i} style={htmlStyles.list}>
                {block.items!.map((item, j) => (
                  <View key={j} style={[htmlStyles.listItem, j === block.items!.length - 1 && { marginBottom: 0 }]}>
                    <View style={htmlStyles.bulletDot} />
                    <Text style={htmlStyles.listItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          case 'table':
            return (
              <View key={i} style={htmlStyles.table}>
                {block.rows!.map(([key, value], j) => (
                  <View
                    key={j}
                    style={[
                      htmlStyles.tableRow,
                      j % 2 === 0 ? htmlStyles.tableRowEven : null,
                      j === block.rows!.length - 1 ? htmlStyles.tableRowLast : null,
                    ]}
                  >
                    <Text style={htmlStyles.tableKey}>{key}</Text>
                    <Text style={htmlStyles.tableValue}>{value}</Text>
                  </View>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </View>
  );
}

const createHtmlStyles = (colors: ThemeColors) => StyleSheet.create({
  heading: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
    marginTop: 20,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  paragraph: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  list: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    color: colors.tint,
    marginRight: 10,
    lineHeight: 21,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tint,
    marginRight: 10,
    marginTop: 8,
  },
  listItemText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    flex: 1,
  },
  table: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableRowEven: {
    backgroundColor: colors.backgroundSecondary,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableKey: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
  },
  tableValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
});

// Legacy stripHtml for simple strings
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Review Types ---
interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  distribution: { rating: number; count: number }[];
}

interface Review {
  id: string;
  rating: number;
  title?: string;
  content: string;
  isVerifiedPurchase: boolean;
  helpfulCount?: number;
  adminReply?: string | null;
  adminReplyAt?: string | null;
  adminReplyBy?: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}

// --- Wishlist Button ---
function WishlistButton({ productId }: { productId: string }) {
  const { isInWishlist, toggle } = useWishlist();
  const { user } = useAuth();
  const router = useRouter();
  const isFav = isInWishlist(productId);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={[styles.wishlistBtn, isFav && styles.wishlistBtnActive]}
      onPress={() => {
        if (!user) {
          router.push('/(auth)/login');
          return;
        }
        toggle(productId);
      }}
      activeOpacity={0.7}
    >
      <FontAwesome
        name={isFav ? 'heart' : 'heart-o'}
        size={20}
        color={isFav ? colors.destructive : colors.textMuted}
      />
    </TouchableOpacity>
  );
}

// --- Image Gallery ---
function ImageGallery({ images }: { images: { url: string; alt: string | null }[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mainListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const scrollTo = (index: number) => {
    mainListRef.current?.scrollToIndex({ index, animated: true });
    setActiveIndex(index);
  };

  if (!images || images.length === 0) {
    return (
      <View style={styles.galleryPlaceholder}>
        <FontAwesome name="image" size={48} color={colors.border} />
        <Text style={styles.galleryPlaceholderText}>Brak zdjęć</Text>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: '#FFFFFF' }}>
      <FlatList
        ref={mainListRef}
        data={images}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }) => (
          <View style={styles.galleryImageWrap}>
            <Image
              source={{ uri: item.url }}
              style={styles.galleryImage}
              contentFit="contain"
              transition={200}
            />
          </View>
        )}
      />
      {images.length > 1 && (
        <>
          {/* Thumbnail strip */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailStrip}
          >
            {images.map((img, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => scrollTo(index)}
                activeOpacity={0.8}
                style={[
                  styles.thumbnailWrap,
                  index === activeIndex && styles.thumbnailWrapActive,
                ]}
              >
                <Image
                  source={{ uri: img.url }}
                  style={styles.thumbnailImage}
                  contentFit="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* dot indicators */}
          <View style={styles.dotsContainer}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === activeIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// --- Star Rating ---
function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  const colors = useThemeColors();
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <FontAwesome
        key={i}
        name={i <= Math.round(rating) ? 'star' : 'star-o'}
        size={size}
        color={colors.warning}
        style={{ marginRight: 2 }}
      />
    );
  }
  return <View style={{ flexDirection: 'row' }}>{stars}</View>;
}

// --- Product Info Tabs (Opis / Specyfikacja) ---
function ProductInfoTabs({
  description,
  specifications,
}: {
  description?: string;
  specifications?: Record<string, string>;
}) {
  const [activeTab, setActiveTab] = useState<'opis' | 'spec'>('opis');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const htmlStyles = useMemo(() => createHtmlStyles(colors), [colors]);

  const allBlocks = description ? parseHtmlBlocks(description) : [];
  // Skip the first block if it's an ALL-CAPS heading (redundant product title)
  const filtered = allBlocks.length > 0 && allBlocks[0].type === 'heading'
    && allBlocks[0].text && allBlocks[0].text === allBlocks[0].text.toUpperCase()
    ? allBlocks.slice(1)
    : allBlocks;
  const descBlocks = filtered.filter(b => b.type !== 'table');
  const tableBlocks = filtered.filter(b => b.type === 'table');
  const specEntries = specifications ? Object.entries(specifications) : [];
  const hasSpec = tableBlocks.length > 0 || specEntries.length > 0;

  if (descBlocks.length === 0 && !hasSpec) return null;

  const tabs: { key: 'opis' | 'spec'; label: string }[] = [{ key: 'opis', label: 'Opis' }];
  if (hasSpec) tabs.push({ key: 'spec', label: 'Specyfikacja' });

  // Collect all spec rows into one flat list for the spec tab
  const allSpecRows: Array<[string, string]> = [];
  for (const entry of specEntries) allSpecRows.push([entry[0], String(entry[1])]);
  for (const block of tableBlocks) {
    if (block.rows) allSpecRows.push(...block.rows);
  }

  return (
    <View style={styles.tabsWrap}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map(t => {
          const active = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              onPress={() => setActiveTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Opis tab */}
      {activeTab === 'opis' && (
        <View style={styles.tabBody}>
          {descBlocks.map((block, i) => {
            switch (block.type) {
              case 'heading':
                return (
                  <Text key={i} style={[htmlStyles.heading, i === 0 && { marginTop: 4 }]}>
                    {block.text}
                  </Text>
                );
              case 'paragraph':
                return (
                  <Text key={i} style={[htmlStyles.paragraph, i === 0 && { marginTop: 0 }]}>
                    {block.text}
                  </Text>
                );
              case 'list':
                return (
                  <View key={i} style={htmlStyles.list}>
                    {block.items!.map((item, j) => (
                      <View key={j} style={[htmlStyles.listItem, j === block.items!.length - 1 && { marginBottom: 0 }]}>
                        <View style={htmlStyles.bulletDot} />
                        <Text style={htmlStyles.listItemText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                );
              default:
                return null;
            }
          })}
          {descBlocks.length === 0 && (
            <Text style={htmlStyles.paragraph}>Brak opisu produktu.</Text>
          )}
        </View>
      )}

      {/* Specyfikacja tab */}
      {activeTab === 'spec' && (
        <View style={styles.tabBody}>
          <View style={styles.specTableWrap}>
            {allSpecRows.map(([key, value], idx) => (
              <View
                key={idx}
                style={[
                  styles.specRow,
                  idx % 2 === 0 && styles.specRowAlt,
                ]}
              >
                <Text style={styles.specLabel}>{key}</Text>
                <Text style={styles.specVal}>{value}</Text>
              </View>
            ))}
          </View>
          {allSpecRows.length === 0 && (
            <Text style={htmlStyles.paragraph}>Brak specyfikacji.</Text>
          )}
        </View>
      )}
    </View>
  );
}

// --- Accordion ---
function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rotateAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggleOpen = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(!open);
    Animated.timing(rotateAnim, {
      toValue: open ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={styles.accordionContainer}>
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={toggleOpen}
        activeOpacity={0.7}
      >
        <Text style={styles.accordionTitle}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <FontAwesome
            name="chevron-down"
            size={14}
            color={colors.textMuted}
          />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={styles.accordionContent}>{children}</View>}
    </View>
  );
}

// --- Skeleton shimmer block ---
function SkeletonPulse({ width, height, style }: { width: number | string; height: number; style?: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return <Animated.View style={[{ width: width as any, height, borderRadius: 8, backgroundColor: '#888', opacity }, style]} />;
}

function ProductSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <SkeletonPulse width="100%" height={300} style={{ borderRadius: 12 }} />
      <View style={{ gap: 8 }}>
        <SkeletonPulse width="85%" height={20} />
        <SkeletonPulse width="60%" height={16} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SkeletonPulse width={80} height={28} />
        <SkeletonPulse width={60} height={28} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SkeletonPulse width={100} height={14} />
        <SkeletonPulse width={80} height={14} />
      </View>
      <SkeletonPulse width="100%" height={48} style={{ borderRadius: 12 }} />
      <SkeletonPulse width="100%" height={48} style={{ borderRadius: 12 }} />
      <View style={{ gap: 8, marginTop: 8 }}>
        <SkeletonPulse width="100%" height={14} />
        <SkeletonPulse width="90%" height={14} />
        <SkeletonPulse width="75%" height={14} />
      </View>
    </View>
  );
}

// --- Main Screen ---
export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addToCart } = useCart();
  const { user } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [addingToCart, setAddingToCart] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [showListModal, setShowListModal] = useState(false);

  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [loadingAllReviews, setLoadingAllReviews] = useState(false);

  // Review form state
  const [canReview, setCanReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const { show: showToast } = useToast();

  const [warehouseProducts, setWarehouseProducts] = useState<Product[]>([]);
  const [warehouseSource, setWarehouseSource] = useState<'warehouse' | 'category'>('warehouse');

  // Fetch product
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    // Reset stale data from previous product
    setProduct(null);
    setReviewStats(null);
    setReviews([]);
    setShowAllReviews(false);
    setWarehouseProducts([]);
    setCanReview(false);
    setHasReviewed(false);
    setSelectedVariant(null);
    setSelectedAttributes({});

    api
      .get<any>(`/products/${id}`)
      .then((data) => {
        if (cancelled) return;
        // API may return { product: Product } or Product directly
        const prod: Product = data.product || data;
        setProduct(prod);
        // Auto-select first variant if exists
        if (prod.variants && prod.variants.length > 0) {
          const firstVariant = prod.variants[0];
          setSelectedVariant(firstVariant);
          setSelectedAttributes(firstVariant.attributes || {});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Nie udało się pobrać produktu');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  // Fetch reviews + same warehouse (use product.id = CUID, not route param which may be slug)
  useEffect(() => {
    if (!product) return;
    const pid = product.id;
    let cancelled = false;

    // Reviews stats
    api
      .get<ReviewStats>(`/products/${pid}/reviews/stats`)
      .then((data) => { if (!cancelled) setReviewStats(data); })
      .catch(() => {});

    // Reviews list
    api
      .get<{ reviews: Review[] }>(`/products/${pid}/reviews?limit=5&sort=newest`)
      .then((data) => { if (!cancelled) setReviews(data.reviews || []); })
      .catch(() => {});

    // Can review check
    if (user) {
      api
        .get<{ canReview: boolean; hasReviewed: boolean }>(`/products/${pid}/reviews/can-review`)
        .then((data) => {
          if (cancelled) return;
          setCanReview(data.canReview);
          setHasReviewed(data.hasReviewed);
        })
        .catch(() => {});
    }

    // Same warehouse products
    api
      .get<{ products: Product[] }>(`/products/same-warehouse/${pid}?limit=10`)
      .then((data) => {
        if (cancelled) return;
        const prods = data.products || [];
        if (prods.length > 0) {
          setWarehouseSource('warehouse');
        }
        setWarehouseProducts(prods);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [product?.id]);

  // Fallback: if no warehouse products, fetch from same category
  useEffect(() => {
    if (!product || warehouseProducts.length > 0 || loading) return;

    const categoryId = product.categoryId || (product.category as any)?.id;
    if (!categoryId) return;

    api
      .get<any>(`/products?categoryId=${categoryId}&limit=11`)
      .then((data) => {
        const prods = (data.products || data.data || [])
          .filter((p: Product) => p.id !== product.id)
          .slice(0, 10);
        if (prods.length > 0) {
          setWarehouseSource('category');
          setWarehouseProducts(prods);
        }
      })
      .catch(() => {});
  }, [product, warehouseProducts.length, loading]);

  // --- Price helpers ---
  const getPrice = useCallback(() => {
    if (selectedVariant && selectedVariant.price > 0) {
      return selectedVariant.price;
    }
    if (!product || product.price == null) return 0;
    const parsed = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
    return isNaN(parsed) ? 0 : parsed;
  }, [product, selectedVariant]);

  const getComparePrice = useCallback(() => {
    if (!product?.compareAtPrice) return null;
    const compare =
      typeof product.compareAtPrice === 'string'
        ? parseFloat(product.compareAtPrice)
        : product.compareAtPrice;
    return compare > getPrice() ? compare : null;
  }, [product, getPrice]);

  const getLowestPrice30 = useCallback(() => {
    if (!product?.lowestPrice30Days) return null;
    const lowest =
      typeof product.lowestPrice30Days === 'string'
        ? parseFloat(product.lowestPrice30Days)
        : product.lowestPrice30Days;
    if (!lowest || lowest <= 0) return null;
    // Omnibus: lowest 30-day price can never exceed the current selling price
    const currentPrice = getPrice();
    return currentPrice > 0 ? Math.min(lowest, currentPrice) : lowest;
  }, [product, getPrice]);

  // --- Variant helpers ---
  const getAttributeKeys = useCallback(() => {
    if (!product?.variants || product.variants.length <= 1) return [];
    const keys = new Set<string>();
    product.variants.forEach((v) => {
      Object.keys(v.attributes || {}).forEach((k) => keys.add(k));
    });
    return Array.from(keys);
  }, [product]);

  const getAttributeValues = useCallback(
    (key: string) => {
      if (!product?.variants) return [];
      const values = new Set<string>();
      product.variants.forEach((v) => {
        if (v.attributes?.[key]) values.add(v.attributes[key]);
      });
      return Array.from(values);
    },
    [product]
  );

  const handleAttributeSelect = useCallback(
    (key: string, value: string) => {
      const newAttrs = { ...selectedAttributes, [key]: value };
      setSelectedAttributes(newAttrs);

      // Find matching variant
      const match = product?.variants?.find((v) =>
        Object.entries(newAttrs).every(([k, val]) => v.attributes?.[k] === val)
      );
      if (match) setSelectedVariant(match);
    },
    [product, selectedAttributes]
  );

  // --- Stock status ---
  const getStockInfo = useCallback(() => {
    if (!selectedVariant) {
      // No variants - check if product has any variant with stock
      if (product?.variants && product.variants.length > 0) {
        const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
        if (totalStock === 0) return { status: 'out', label: 'Niedostępny', color: colors.textMuted };
        if (totalStock <= 5) return { status: 'low', label: 'Mało sztuk', color: colors.warning };
        return { status: 'in', label: 'Dostępny', color: colors.success };
      }
      return { status: 'in', label: 'Dostępny', color: colors.success };
    }

    if (selectedVariant.stock === 0) return { status: 'out', label: 'Niedostępny', color: colors.textMuted };
    if (selectedVariant.stock <= 5) return { status: 'low', label: 'Mało sztuk', color: colors.warning };
    return { status: 'in', label: 'Dostępny', color: colors.success };
  }, [product, selectedVariant]);

  // --- Add to cart ---
  const handleAddToCart = useCallback(async () => {
    if (!product) return;

    const variantId = selectedVariant?.id || product.variants?.[0]?.id;
    if (!variantId) {
      Alert.alert('Błąd', 'Brak dostępnego wariantu produktu');
      return;
    }

    const stock = getStockInfo();
    if (stock.status === 'out') {
      Alert.alert('Niedostępny', 'Ten produkt jest obecnie niedostępny');
      return;
    }

    setAddingToCart(true);
    try {
      const price = Number(selectedVariant?.price || product.price) || 0;
      await addToCart(variantId, quantity, {
        productId: product.id,
        name: product.name,
        imageUrl: product.images?.[0]?.url,
        price,
        quantity,
        warehouse: product.wholesaler || undefined,
      });
    } catch (err: any) {
      Alert.alert('Błąd', err.message || 'Nie udało się dodać do koszyka');
    } finally {
      setAddingToCart(false);
    }
  }, [product, selectedVariant, addToCart, getStockInfo, quantity]);

  // --- Buy now ---
  const handleBuyNow = useCallback(async () => {
    if (!product) return;
    const variantId = selectedVariant?.id || product.variants?.[0]?.id;
    if (!variantId) {
      Alert.alert('Błąd', 'Brak dostępnego wariantu produktu');
      return;
    }
    const stock = getStockInfo();
    if (stock.status === 'out') {
      Alert.alert('Niedostępny', 'Ten produkt jest obecnie niedostępny');
      return;
    }
    setBuyingNow(true);
    try {
      // No productInfo → modal is skipped; navigate straight to cart
      await addToCart(variantId, quantity);
      router.push('/cart');
    } catch (err: any) {
      Alert.alert('Błąd', err.message || 'Nie udało się dodać do koszyka');
      setBuyingNow(false);
    }
  }, [product, selectedVariant, addToCart, getStockInfo, quantity, router]);

  // --- Loading / Error states ---
  if (loading) {
    return (
      <View style={styles.centered}>
        <View style={{ width: '100%', padding: 16 }}>
          {/* Image skeleton */}
          <ProductSkeleton />
        </View>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.centered}>
        <FontAwesome name="exclamation-triangle" size={48} color={colors.destructive} />
        <Text style={styles.errorText}>{error || 'Nie znaleziono produktu'}</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.tint }]} onPress={() => {
            setError(null);
            setLoading(true);
            api.get<any>(`/products/${id}`)
              .then((data) => {
                const prod: Product = data.product || data;
                setProduct(prod);
                if (prod.variants && prod.variants.length > 0) {
                  setSelectedVariant(prod.variants[0]);
                  setSelectedAttributes(prod.variants[0].attributes || {});
                }
              })
              .catch((err) => setError(err.message || 'Nie udało się pobrać produktu'))
              .finally(() => setLoading(false));
          }}>
            <Text style={[styles.retryButtonText, { color: '#fff' }]}>Spróbuj ponownie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryButtonText}>Wróć</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const price = Number(getPrice()) || 0;
  const comparePrice = getComparePrice();
  const lowestPrice30 = getLowestPrice30();
  const hasDiscount = comparePrice != null && comparePrice > price;
  const isOutletProduct = !!(product.sku?.toUpperCase().startsWith('OUTLET-') || (product as any).badge === 'outlet' || ((product as any).tags as string[] | undefined)?.some((t: string) => t.toLowerCase() === 'rzeszów'));
  const stockInfo = getStockInfo();
  const attributeKeys = getAttributeKeys();

  // Submit review handler
  const handleSubmitReview = async () => {
    if (reviewRating === 0) {
      showToast('Wybierz ocenę (1-5 gwiazdek)', 'error');
      return;
    }
    if (reviewContent.trim().length < 10) {
      showToast('Treść opinii musi mieć minimum 10 znaków', 'error');
      return;
    }
    if (!product) return;
    setSubmittingReview(true);
    try {
      const pid = product.id;
      await api.post('/reviews', {
        productId: pid,
        rating: reviewRating,
        title: reviewTitle.trim() || undefined,
        content: reviewContent.trim(),
      });
      showToast('Dziękujemy za opinię!', 'success');
      setShowReviewForm(false);
      setReviewRating(0);
      setReviewTitle('');
      setReviewContent('');
      setCanReview(false);
      setHasReviewed(true);
      // Refresh reviews & product data for updated rating
      api.get<ReviewStats>(`/products/${pid}/reviews/stats`).then(setReviewStats).catch(() => {});
      api.get<{ reviews: Review[] }>(`/products/${pid}/reviews?limit=5&sort=newest`).then((d) => setReviews(d.reviews || [])).catch(() => {});
      // Re-fetch product to get updated average_rating and review_count
      api.get<any>(`/products/${pid}`).then((data) => {
        const prod: Product = data.product || data;
        setProduct(prod);
      }).catch(() => {});
    } catch (err: any) {
      showToast(err.message || 'Nie udało się dodać opinii', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: product.name.substring(0, 30) }} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <ImageGallery images={product.images || []} />

        <View style={styles.content}>
          {/* Badge */}
          {product.badge && (
            <View style={styles.badgeRow}>
              <View
                style={[
                  styles.badgeChip,
                  {
                    backgroundColor:
                      product.badge === 'super-price'
                        ? colors.success
                        : product.badge === 'outlet'
                          ? colors.warning
                          : product.badge === 'bestseller'
                            ? colors.tint
                            : colors.success,
                  },
                ]}
              >
                <Text style={styles.badgeText}>
                  {product.badge === 'super-price'
                    ? 'Super cena'
                    : product.badge === 'outlet'
                      ? 'Outlet'
                      : product.badge === 'bestseller'
                        ? 'Bestseller'
                        : 'Nowość'}
                </Text>
              </View>
            </View>
          )}

          {/* Product Name */}
          <Text style={styles.productName}>{product.name}</Text>

          {/* SKU */}
          {product.sku && (
            <Text style={styles.sku}>SKU: {product.sku.replace(/^(hp-|leker-|btp-|dofirmy-|outlet-|ikonka-|hk-|hs-|polzoo-)/i, '')}</Text>
          )}

          {/* Manufacturer / GPSR link */}
          {(product as any).manufacturer && (
            <TouchableOpacity
              style={styles.manufacturerRow}
              onPress={() => router.push(`/manufacturer/${(product as any).manufacturer.slug}`)}
              activeOpacity={0.7}
            >
              <FontAwesome name="industry" size={13} color={colors.tint} />
              <Text style={styles.manufacturerName}>{(product as any).manufacturer.name}</Text>
              <FontAwesome name="chevron-right" size={11} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Rating summary */}
          {reviewStats && reviewStats.totalReviews > 0 && (
            <View style={styles.ratingSummaryRow}>
              <StarRating rating={reviewStats.averageRating} size={14} />
              <Text style={styles.ratingText}>
                {reviewStats.averageRating.toFixed(1)} ({pluralizeReviews(reviewStats.totalReviews)})
              </Text>
            </View>
          )}

          {/* Price Section */}
          <View style={styles.priceSection}>
            <View style={styles.priceRow}>
              <Text
                style={[
                  styles.currentPrice,
                ]}
              >
                {Number(price).toFixed(2).replace('.', ',')} zł
              </Text>
              {hasDiscount && (
                <>
                  <Text style={styles.comparePrice}>
                    {Number(comparePrice).toFixed(2).replace('.', ',')} zł
                  </Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountBadgeText}>
                      -{Math.round(((Number(comparePrice) - price) / Number(comparePrice)) * 100)}%
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* OMNIBUS - Lowest price 30 days */}
            {lowestPrice30 && (
              <Text style={styles.omnibusText}>
                Najniższa cena z 30 dni: {Number(lowestPrice30).toFixed(2).replace('.', ',')} zł
              </Text>
            )}

            {/* Outlet Product Notice */}
            {isOutletProduct && (
              <View style={styles.outletNotice}>
                <FontAwesome name="info-circle" size={15} color="#92400e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.outletNoticeTitle}>Produkt outletowy</Text>
                  <Text style={styles.outletNoticeText}>
                    Produkt może posiadać uszkodzone opakowanie. Objęty pełną gwarancją, identyczną jak przy zakupie nowego produktu.
                  </Text>
                </View>
              </View>
            )}

          </View>

          {/* Variant Selection */}
          {attributeKeys.length > 0 && (
            <View style={styles.variantsSection}>
              {attributeKeys.map((key) => (
                <View key={key} style={styles.variantGroup}>
                  <Text style={styles.variantLabel}>{key}:</Text>
                  <View style={styles.chipsRow}>
                    {getAttributeValues(key).map((value) => {
                      const isSelected = selectedAttributes[key] === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          style={[
                            styles.chip,
                            isSelected && styles.chipSelected,
                          ]}
                          onPress={() => handleAttributeSelect(key, value)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              isSelected && styles.chipTextSelected,
                            ]}
                          >
                            {value}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Quantity Selector */}
          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>Ilość:</Text>
            <View style={styles.quantityStepper}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setQuantity(q => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                activeOpacity={0.7}
              >
                <Text style={[styles.quantityBtnText, quantity <= 1 && { opacity: 0.4 }]}>−</Text>
              </TouchableOpacity>
              <Text style={styles.quantityValue}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setQuantity(q => Math.min((selectedVariant?.stock ?? 999), q + 1))}
                activeOpacity={0.7}
              >
                <Text style={styles.quantityBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            {selectedVariant && selectedVariant.stock > 0 && (
              <Text style={styles.stockAvailable}>Dostępne: {selectedVariant.stock}</Text>
            )}
          </View>

          {/* Stock Status */}
          <View style={styles.stockRow}>
            <FontAwesome
              name={stockInfo.status !== 'out' ? 'check-circle' : 'times-circle'}
              size={15}
              color={stockInfo.color}
            />
            <Text style={[styles.stockText, { color: stockInfo.color }]}>
              {stockInfo.status === 'in'
                ? 'W magazynie – wysyłka w ciągu 24–72h'
                : stockInfo.status === 'low'
                  ? `Mało sztuk – wysyłka w ciągu 24–72h`
                  : 'Produkt chwilowo niedostępny'}
            </Text>
          </View>

          {/* Kup teraz */}
          <TouchableOpacity
            style={[
              styles.buyNowButton,
              (stockInfo.status === 'out') && styles.addToCartDisabled,
            ]}
            onPress={handleBuyNow}
            disabled={buyingNow || stockInfo.status === 'out'}
            activeOpacity={0.8}
          >
            {buyingNow ? (
              <ActivityIndicator color={colors.textInverse} size="small" />
            ) : (
              <Text style={styles.buyNowText}>
                {stockInfo.status === 'out' ? 'Brak w magazynie' : 'Kup teraz'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Add to Cart + Wishlist */}
          <View style={styles.cartRow}>
            <TouchableOpacity
              style={[
                styles.addToCartOutline,
                stockInfo.status === 'out' && styles.addToCartOutlineDisabled,
              ]}
              onPress={handleAddToCart}
              disabled={addingToCart || stockInfo.status === 'out'}
              activeOpacity={0.8}
            >
              {addingToCart ? (
                <ActivityIndicator color={colors.tint} size="small" />
              ) : (
                <>
                  <FontAwesome
                    name="shopping-cart"
                    size={17}
                    color={stockInfo.status === 'out' ? colors.textMuted : colors.tint}
                  />
                  <Text style={[
                    styles.addToCartOutlineText,
                    stockInfo.status === 'out' && { color: colors.textMuted },
                  ]}>
                    Dodaj do koszyka
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <WishlistButton productId={product.id} />
          </View>

          {/* Add to Shopping List */}
          <TouchableOpacity
            style={styles.addToListBtn}
            onPress={() => {
              if (!user) {
                router.push('/(auth)/login');
                return;
              }
              setShowListModal(true);
            }}
            activeOpacity={0.7}
          >
            <FontAwesome name="list-ul" size={16} color={colors.textSecondary} />
            <Text style={styles.addToListText}>Dodaj do listy zakupowej</Text>
          </TouchableOpacity>

          {/* Warehouse city + Delivery options */}
          {(() => {
            const tags: string[] = (product as any).tags || [];
            let warehouseCity = '';
            
            if (product.warehouseLocation) {
              warehouseCity = CITY_LOCATIVE_MAP[product.warehouseLocation] || product.warehouseLocation;
            }
            
            if (!warehouseCity) {
              const skuLower = product.sku?.toLowerCase() || '';
              if (tags.some(t => t.toLowerCase() === 'rzeszów' || t.toLowerCase() === 'outlet') || skuLower.startsWith('outlet-')) warehouseCity = 'Rzeszowie';
              else if (tags.some(t => t.toLowerCase().includes('hurtownia przemysłowa')) || skuLower.startsWith('hp-')) warehouseCity = 'Zielonej Górze';
              else if (tags.some(t => t.toLowerCase().includes('hurtownia sportowa')) || skuLower.startsWith('hs-')) warehouseCity = 'Zielonej Górze';
              else if (tags.some(t => t.toLowerCase() === 'ikonka')) warehouseCity = 'Białymstoku';
              else if (tags.some(t => t.toLowerCase() === 'leker') || skuLower.startsWith('leker-')) warehouseCity = 'Chynowie';
              else if (tags.some(t => t.toLowerCase() === 'btp') || skuLower.startsWith('btp-')) warehouseCity = 'Chotowie';
              else if (tags.some(t => t.toLowerCase() === 'dofirmy') || skuLower.startsWith('dofirmy-')) warehouseCity = 'Koszalinie';
              else if (tags.some(t => t.toLowerCase().includes('hurtownia kuchenna')) || skuLower.startsWith('hk-')) warehouseCity = 'Warszawie';
              else if (tags.some(t => t.toLowerCase() === 'polzoo') || skuLower.startsWith('polzoo-')) warehouseCity = 'Rykach';
            }

            const productPrice = price;
            const freeThreshold = 300;
            const qualifiesFree = productPrice >= freeThreshold;
            const gabarytTag = tags.find(t => /^(\d+(?:\.\d+)?\s*)?gabaryt$/i.test(t));
            const isGabaryt = !!gabarytTag;
            const gabarytMatch = gabarytTag?.match(/^(\d+(?:\.\d+)?)\s*gabaryt$/i);
            const gabarytPrice = gabarytMatch ? parseFloat(gabarytMatch[1]) : 49.99;
            const isCourierOnly = tags.some(t => /^tylko\s*kurier$/i.test(t));
            let weightPrice = 28.99;
            if (isCourierOnly) {
              for (const t of tags) {
                const wm = t.match(/^do\s*(\d+(?:[,.]\d+)?)\s*kg$/i);
                if (wm) { weightPrice = parseFloat(wm[1].replace(',', '.')) <= 20 ? 25.99 : 28.99; break; }
              }
            }

            type DeliveryMethod = { name: string; icon: string; price: number; freeEligible: boolean };
            const methods: DeliveryMethod[] = isGabaryt
              ? [{ name: 'Wysyłka gabaryt (kurier)', icon: 'truck', price: gabarytPrice, freeEligible: false }]
              : isCourierOnly
                ? [{ name: 'Kurier DPD', icon: 'truck', price: weightPrice, freeEligible: true }]
                : [
                    { name: 'InPost Paczkomat', icon: 'inbox', price: 15.99, freeEligible: true },
                    { name: 'Kurier InPost', icon: 'truck', price: 19.99, freeEligible: true },
                  ];

            return (
              <View style={styles.deliverySection}>
                {warehouseCity ? (
                  <View style={styles.warehouseCityRow}>
                    <FontAwesome name="map-marker" size={14} color={colors.tint} />
                    <Text style={styles.warehouseCityText}>
                      Produkt znajduje się w magazynie w {warehouseCity}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.deliveryHeader}>
                  <FontAwesome name="truck" size={14} color={colors.textMuted} />
                  <Text style={styles.deliveryTitle}>Opcje dostawy</Text>
                </View>
                {methods.map((m, i) => {
                  const isFree = m.freeEligible && qualifiesFree;
                  return (
                    <View key={i} style={styles.deliveryRow}>
                      <FontAwesome name={m.icon as any} size={15} color={colors.tint} />
                      <Text style={styles.deliveryName}>{m.name}</Text>
                      {isFree ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.deliveryPriceOld}>{m.price.toFixed(2).replace('.', ',')} zł</Text>
                          <Text style={styles.deliveryFree}>GRATIS</Text>
                        </View>
                      ) : (
                        <Text style={styles.deliveryPrice}>{m.price.toFixed(2).replace('.', ',')} zł</Text>
                      )}
                    </View>
                  );
                })}
                {!qualifiesFree && !isGabaryt && (
                  <Text style={styles.deliveryFreeHint}>
                    Darmowa wysyłka od {freeThreshold} zł (brakuje {(freeThreshold - productPrice).toFixed(2).replace('.', ',')} zł)
                  </Text>
                )}
              </View>
            );
          })()}

          {/* Description & Specifications Tabs */}
          {(product.description || (product.specifications && Object.keys(product.specifications).length > 0)) && (
            <ProductInfoTabs
              description={product.description}
              specifications={product.specifications}
            />
          )}

          {/* Delivery Info */}
          {product.deliveryInfo && (
            <Accordion title="Dostawa">
              <HtmlContent html={product.deliveryInfo} />
            </Accordion>
          )}

          {/* Reviews Section — x-kom style */}
          <View style={styles.reviewsSection}>
            {/* Header row: "Opinie 4.5 ★★★★★ (26 opinii)" */}
            <View style={styles.reviewsSectionHeader}>
              <Text style={styles.reviewsSectionTitle}>Opinie</Text>
              {reviewStats && reviewStats.totalReviews > 0 && (
                <>
                  <Text style={styles.reviewsSectionRating}>
                    {reviewStats.averageRating.toFixed(1)}
                  </Text>
                  <StarRating rating={reviewStats.averageRating} size={14} />
                  <Text style={styles.reviewsSectionCount}>
                    ({pluralizeReviews(reviewStats.totalReviews)})
                  </Text>
                </>
              )}
            </View>

            {/* Rating Distribution */}
            {reviewStats && reviewStats.distribution && reviewStats.distribution.length > 0 && (
              <View style={styles.ratingDistribution}>
                {[5, 4, 3, 2, 1].map((star) => {
                  const entry = reviewStats.distribution.find(d => d.rating === star);
                  const count = entry?.count || 0;
                  const pct = reviewStats.totalReviews > 0 ? (count / reviewStats.totalReviews) * 100 : 0;
                  return (
                    <View key={star} style={styles.distRow}>
                      <Text style={styles.distStar}>{star} gw.</Text>
                      <View style={styles.distBarBg}>
                        <View style={[styles.distBarFill, { width: `${pct}%` as any }]} />
                      </View>
                      <Text style={styles.distCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Horizontal scrollable review cards */}
            {reviews.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reviewsHScroll}
              >
                {reviews.map((review) => (
                  <View key={review.id} style={styles.reviewHCard}>
                    <View style={styles.reviewHCardHeader}>
                      <StarRating rating={review.rating} size={12} />
                      <Text style={styles.reviewHCardAuthor}>
                        {review.user
                          ? `${review.user.firstName} | `
                          : ''}
                        {new Date(review.createdAt).toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        {', '}
                        {new Date(review.createdAt).toLocaleTimeString('pl-PL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    {review.title && (
                      <Text style={styles.reviewHCardTitle}>
                        {review.title}
                      </Text>
                    )}
                    <Text style={styles.reviewHCardContent} numberOfLines={4}>
                      {review.content}
                    </Text>
                    {review.adminReply && (
                      <View style={{
                        marginTop: 8,
                        padding: 10,
                        backgroundColor: colors.backgroundTertiary,
                        borderLeftWidth: 3,
                        borderLeftColor: '#3B82F6',
                        borderRadius: 6,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#60A5FA', marginBottom: 3 }}>
                          Odpowiedź sklepu
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }} numberOfLines={3}>
                          {review.adminReply}
                        </Text>
                      </View>
                    )}
                    {review.isVerifiedPurchase && (
                      <View style={styles.reviewHCardVerified}>
                        <FontAwesome name="check-circle" size={11} color={colors.success} />
                        <Text style={styles.reviewHCardVerifiedText}>Zweryfikowany zakup</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            {/* "Zobacz wszystkie opinie" button */}
            {reviewStats && reviewStats.totalReviews > 0 && (
              <TouchableOpacity
                style={styles.seeAllReviewsBtn}
                activeOpacity={0.7}
                onPress={() => {
                  if (!product) return;
                  router.push({
                    pathname: '/product/reviews',
                    params: {
                      productId: product.id,
                      productName: product.name,
                    },
                  });
                }}
              >
                <Text style={styles.seeAllReviewsText}>
                  Zobacz wszystkie opinie ({reviewStats.totalReviews})
                </Text>
              </TouchableOpacity>
            )}

            {/* "Masz ten produkt?" CTA */}
            <View style={styles.reviewCta}>
              <Text style={styles.reviewCtaTitle}>Masz ten produkt?</Text>
              <Text style={styles.reviewCtaSubtitle}>Oceń go i pomóż innym w wyborze</Text>
              {!showReviewForm ? (
                <TouchableOpacity
                  style={styles.addReviewBtn}
                  onPress={() => {
                    if (!user) {
                      router.push('/(auth)/login');
                      return;
                    }
                    if (hasReviewed) {
                      showToast('Już oceniłeś ten produkt', 'info');
                      return;
                    }
                    setShowReviewForm(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addReviewBtnText}>Dodaj opinię</Text>
                </TouchableOpacity>
              ) : (
                /* Review Form */
                <View style={styles.reviewForm}>
                  {/* Star picker */}
                  <Text style={styles.reviewFormLabel}>Twoja ocena</Text>
                  <View style={styles.starPicker}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => setReviewRating(star)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <FontAwesome
                          name={star <= reviewRating ? 'star' : 'star-o'}
                          size={32}
                          color={star <= reviewRating ? colors.warning : colors.border}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Title */}
                  <Text style={styles.reviewFormLabel}>Tytuł (opcjonalnie)</Text>
                  <TextInput
                    style={styles.reviewFormInput}
                    placeholder="Np. Świetny produkt!"
                    placeholderTextColor={colors.placeholder}
                    value={reviewTitle}
                    onChangeText={setReviewTitle}
                    maxLength={200}
                  />

                  {/* Content */}
                  <Text style={styles.reviewFormLabel}>Treść opinii</Text>
                  <TextInput
                    style={[styles.reviewFormInput, styles.reviewFormTextarea]}
                    placeholder="Opisz swoje wrażenia z używania produktu..."
                    placeholderTextColor={colors.placeholder}
                    value={reviewContent}
                    onChangeText={setReviewContent}
                    multiline
                    numberOfLines={4}
                    maxLength={5000}
                    textAlignVertical="top"
                  />
                  <Text style={styles.reviewFormCharCount}>
                    {reviewContent.length}/5000 (min. 10)
                  </Text>

                  {/* Buttons */}
                  <View style={styles.reviewFormButtons}>
                    <TouchableOpacity
                      style={styles.reviewFormCancel}
                      onPress={() => {
                        setShowReviewForm(false);
                        setReviewRating(0);
                        setReviewTitle('');
                        setReviewContent('');
                      }}
                    >
                      <Text style={styles.reviewFormCancelText}>Anuluj</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.reviewFormSubmit,
                        (submittingReview || reviewRating === 0 || reviewContent.trim().length < 10) && styles.reviewFormSubmitDisabled,
                      ]}
                      onPress={handleSubmitReview}
                      disabled={submittingReview || reviewRating === 0 || reviewContent.trim().length < 10}
                      activeOpacity={0.8}
                    >
                      {submittingReview ? (
                        <ActivityIndicator size="small" color={colors.textInverse} />
                      ) : (
                        <Text style={styles.reviewFormSubmitText}>Wyślij opinię</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Same Warehouse Products */}
          {warehouseProducts.length > 0 && (
            <View style={styles.warehouseSection}>
              <ProductCarousel
                title={warehouseSource === 'warehouse' ? 'Inne produkty z tego magazynu' : 'Podobne produkty'}
                products={warehouseProducts}
              />
            </View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
      </SafeAreaView>
      <BottomTabBar />

      {/* Add to Shopping List Modal */}
      {product && (
        <AddToListModal
          visible={showListModal}
          onClose={() => setShowListModal(false)}
          productId={product.id}
          productName={product.name}
        />
      )}
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.card,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: colors.tint,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.textInverse,
    fontWeight: '600',
  },

  // Gallery
  galleryPlaceholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.8,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryPlaceholderText: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
  },
  galleryImageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.8,
    backgroundColor: '#FFFFFF',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: colors.tint,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },

  // Content
  content: {
    padding: 16,
  },

  // Badge
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  badgeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },

  // Product name
  productName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 28,
    marginBottom: 4,
  },
  sku: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  manufacturerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 6,
  },
  manufacturerName: {
    fontSize: 14,
    color: colors.tint,
    fontWeight: '600',
    flex: 1,
  },

  // Rating summary
  ratingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 13,
    color: colors.textMuted,
  },

  // Price
  priceSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  currentPrice: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  comparePrice: {
    fontSize: 16,
    color: colors.priceOld,
    textDecorationLine: 'line-through',
  },
  discountBadge: {
    backgroundColor: colors.success,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountBadgeText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  omnibusText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  outletNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 8,
    padding: 10,
  },
  outletNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 2,
  },
  outletNoticeText: {
    fontSize: 11,
    color: '#b45309',
    lineHeight: 16,
  },

  // Variants
  variantsSection: {
    marginBottom: 16,
  },
  variantGroup: {
    marginBottom: 12,
  },
  variantLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    backgroundColor: colors.card,
  },
  chipSelected: {
    borderColor: colors.tint,
    backgroundColor: colors.tintLight,
  },
  chipText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: colors.tint,
    fontWeight: '600',
  },

  // Quantity
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  quantityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  quantityStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    overflow: 'hidden',
  },
  quantityBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
  },
  quantityBtnText: {
    fontSize: 20,
    color: colors.text,
    lineHeight: 22,
  },
  quantityValue: {
    minWidth: 36,
    height: 36,
    textAlign: 'center',
    lineHeight: 36,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  stockAvailable: {
    fontSize: 12,
    color: colors.textMuted,
  },

  // Stock
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  stockText: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },

  // Buy now
  buyNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    paddingVertical: 15,
    borderRadius: 12,
    marginBottom: 10,
  },
  buyNowText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },

  // Add to cart (outline)
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  addToCartOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.tint,
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  addToCartOutlineDisabled: {
    borderColor: colors.border,
  },
  addToCartOutlineText: {
    color: colors.tint,
    fontSize: 15,
    fontWeight: '700',
  },
  addToCartButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  addToCartDisabled: {
    backgroundColor: colors.border,
  },
  addToCartText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  wishlistBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishlistBtnActive: {
    borderColor: colors.destructive,
    backgroundColor: colors.destructiveBg,
  },
  addToListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  addToListText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Store
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 8,
  },
  storeText: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Delivery section
  deliverySection: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  warehouseCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  warehouseCityText: {
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  deliveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  deliveryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  deliveryName: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  deliveryPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  deliveryPriceOld: {
    fontSize: 12,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  deliveryFree: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.success,
  },
  deliveryFreeHint: {
    fontSize: 14,
    color: '#16a34a',
    marginTop: 2,
  },

  // Thumbnail gallery
  thumbnailStrip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  thumbnailWrap: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
  },
  thumbnailWrapActive: {
    borderColor: colors.tint,
  },
  thumbnailImage: {
    width: 56,
    height: 56,
  },

  // Accordion
  accordionContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  accordionContent: {
    paddingBottom: 14,
  },

  // ─── Product Info Tabs ───
  tabsWrap: {
    marginTop: 24,
    marginHorizontal: -16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 3,
    marginTop: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: colors.backgroundTertiary,
    elevation: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.tint,
  },
  tabBody: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },

  // ─── Spec rows (Specyfikacja tab) ───
  specTableWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  specRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  specRowAlt: {
    backgroundColor: colors.backgroundSecondary,
  },
  specLabel: {
    fontSize: 13,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 20,
  },
  specVal: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    flex: 1.3,
    paddingLeft: 12,
    lineHeight: 20,
  },

  // Reviews — x-kom style
  reviewsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reviewsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  reviewsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  reviewsSectionRating: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  reviewsSectionCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  ratingDistribution: {
    marginBottom: 16,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  distStar: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 36,
  },
  distBarBg: {
    flex: 1,


























    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  distBarFill: {
    height: 8,
    backgroundColor: '#facc15',
    borderRadius: 4,
  },
  distCount: {
    fontSize: 12,
    color: colors.textMuted,
    width: 24,
    textAlign: 'right',
  },

  // Horizontal review cards
  reviewsHScroll: {
    paddingRight: 16,
    gap: 12,
    marginBottom: 12,
  },
  reviewHCard: {
    width: SCREEN_WIDTH * 0.72,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reviewHCardHeader: {
    marginBottom: 6,
  },
  reviewHCardAuthor: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  reviewHCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  reviewHCardContent: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  reviewHCardVerified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  reviewHCardVerifiedText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '500',
  },

  // See all reviews button
  seeAllReviewsBtn: {
    borderWidth: 1,
    borderColor: colors.tint,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllReviewsText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.tint,
  },

  // "Masz ten produkt?" CTA
  reviewCta: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reviewCtaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  reviewCtaSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
  },
  addReviewBtn: {
    backgroundColor: colors.tint,
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  addReviewBtnText: {
    color: colors.textInverse,
    fontSize: 15,
    fontWeight: '600',
  },

  // Review form
  reviewForm: {
    width: '100%',
    marginTop: 4,
  },
  reviewFormLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  starPicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  reviewFormInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.inputText,
  },
  reviewFormTextarea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  reviewFormCharCount: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  reviewFormButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  reviewFormCancel: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  reviewFormCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  reviewFormSubmit: {
    backgroundColor: colors.tint,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  reviewFormSubmitDisabled: {
    backgroundColor: colors.border,
  },
  reviewFormSubmitText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },

  // Old review styles kept for compatibility
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '500',
  },
  reviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  reviewContent: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Warehouse section
  warehouseSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
