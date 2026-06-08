'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { categoriesApi, CategoryWithChildren } from '../../lib/api';
import { cleanCategoryName } from '../../lib/categories';

interface CategoryFilterProps {
  categoryCounts?: Record<string, number>;
}

function CategoryFilterContent({ categoryCounts }: CategoryFilterProps) {
  const searchParams = useSearchParams();
  const currentCategorySlug = searchParams.get('category') || '';
  
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [categoryPath, setCategoryPath] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch categories - only main categories (order > 0)
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await categoriesApi.getMain();
        setCategories(response.categories);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  // Fetch category path when slug changes
  useEffect(() => {
    async function fetchPath() {
      if (currentCategorySlug) {
        try {
          const response = await categoriesApi.getPath(currentCategorySlug);
          setCategoryPath(response.path);
          // Auto-expand parent categories
          setExpanded(response.path.map(cat => cat.slug));
        } catch (error) {
          console.error('Failed to fetch category path:', error);
          setCategoryPath([]);
        }
      } else {
        setCategoryPath([]);
        setExpanded([]);
      }
    }
    fetchPath();
  }, [currentCategorySlug]);

  const toggleExpand = (slug: string) => {
    setExpanded(prev => 
      prev.includes(slug) 
        ? prev.filter(s => s !== slug) 
        : [...prev, slug]
    );
  };

  // Helper to find category in tree
  const findCategory = (slug: string, cats: CategoryWithChildren[]): CategoryWithChildren | null => {
    for (const cat of cats) {
      if (cat.slug === slug) return cat;
      if (cat.children) {
        const found = findCategory(slug, cat.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Check if slug is a main (root) category
  const isMainCategory = (slug: string) => categories.some(cat => cat.slug === slug);

  // Get parent category from path
  const getParentFromPath = () => {
    if (categoryPath.length >= 2) {
      return categoryPath[categoryPath.length - 2];
    }
    return null;
  };

  const renderCategory = (category: CategoryWithChildren, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expanded.includes(category.slug);
    const isActive = category.slug === currentCategorySlug;
    const isInPath = categoryPath.some(cat => cat.slug === category.slug);

    return (
      <div key={category.slug}>
        <div 
          className={`flex items-center justify-between py-1.5 ${level > 0 ? 'pl-4' : ''}`}
        >
          <Link
            href={`/products?category=${category.slug}`}
            className={`text-sm transition-colors flex-1 ${
              isActive 
                ? 'text-primary-500 font-medium' 
                : isInPath 
                  ? 'text-primary-400'
                  : 'text-secondary-700 dark:text-secondary-300 hover:text-primary-500'
            }`}
          >
            {cleanCategoryName(category.name)}
            {(() => {
              const count = categoryCounts?.[category.slug] ?? category.productCount;
              return count !== undefined ? (
                <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">({count.toLocaleString()})</span>
              ) : null;
            })()}
          </Link>
          {hasChildren && (
            <button 
              onClick={(e) => {
                e.preventDefault();
                toggleExpand(category.slug);
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-secondary-700 rounded"
            >
              <svg 
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-2 border-l border-gray-200 dark:border-secondary-600">
            {category.children!.map(child => renderCategory(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // Determine what to show
  const showAllMainCategories = !currentCategorySlug || isMainCategory(currentCategorySlug);
  const parentCategory = getParentFromPath();

  if (loading) {
    return (
      <div className="mb-6">
        <h3 className="font-semibold text-secondary-900 dark:text-white mb-3">Kategorie</h3>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-6 bg-gray-200 dark:bg-secondary-700 rounded w-3/4"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h3 className="font-semibold text-secondary-900 dark:text-white mb-3">Kategorie</h3>
      
      {/* "All products" link - always visible, highlighted when no category selected */}
      <Link 
        href="/products"
        className={`flex items-center text-sm mb-3 py-1.5 ${
          !currentCategorySlug 
            ? 'text-primary-500 font-medium' 
            : 'text-secondary-700 dark:text-secondary-300 hover:text-primary-500'
        }`}
      >
        Wszystkie produkty
      </Link>
      
      {/* Back link when in subcategory */}
      {!showAllMainCategories && (
        <Link 
          href={parentCategory ? `/products?category=${parentCategory.slug}` : '/products'}
          className="flex items-center gap-2 text-sm text-primary-500 mb-3 hover:text-primary-600"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {parentCategory ? cleanCategoryName(parentCategory.name) : 'Wszystkie kategorie'}
        </Link>
      )}
      
      {/* Category tree */}
      <div className="space-y-0.5">
        {categories.map(cat => renderCategory(cat))}
      </div>
    </div>
  );
}

export default function CategoryFilter({ categoryCounts }: CategoryFilterProps) {
  return (
    <Suspense fallback={<div className="mb-6 animate-pulse"><div className="h-6 bg-gray-200 dark:bg-secondary-700 rounded w-1/3 mb-3"></div><div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-6 bg-gray-200 dark:bg-secondary-700 rounded w-3/4"></div>)}</div></div>}>
      <CategoryFilterContent categoryCounts={categoryCounts} />
    </Suspense>
  );
}
